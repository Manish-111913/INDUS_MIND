"""Entity extraction (docs/02 §10 step 6, docs/05 S7).

Hybrid, and entirely rule-driven: (1) the tenant's active `extraction_rules` run
over each chunk — `regex` and `keyword` methods produce candidates carrying their
rule's confidence and (rule_id, version) provenance; (2) an LLM structured-output
pass per document catches what no rule matched, using a prompt from
`prompt_templates` with the `llm`-method rules' hints appended.

Nothing here is hardcoded: patterns, confidences, priorities and the prompt all
come from the database, because every plant tags its equipment differently. The
LLM pass is best-effort and degrades to rules-only when no API key is configured.
Equipment tags are normalized and resolved against the equipment registry
(fuzzy); a resolve score below the config's confidence_threshold leaves the
entity unlinked and in `auto` (human-review) status.
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.llm import resolve_config, structured_complete
from app.core.logging import get_logger
from app.modules.equipment.repository import normalize_tag
from app.modules.equipment.service import EquipmentService
from app.modules.ingestion.models import DocumentChunk, ExtractedEntity
from app.modules.ingestion.rules_engine import InvalidPattern, LoadedRule, apply_rule, load_rules

log = get_logger("ingestion.extraction")

PROMPT_KEY = "extract.entities"
EXTRACTION_SCHEMA = ('{"entities":[{"type":"equipment_tag|parameter|regulation_ref|person|'
                     'date|material|failure_mode|procedure_ref","value":"string",'
                     '"confidence":0.0}]}')
_BASE_SYSTEM = "You extract industrial entities from maintenance/engineering text."
_LLM_CORPUS_CHARS = 6000


def _system_with_hints(rules: list[LoadedRule]) -> str:
    """Base instruction + every `llm`-method rule's hint (docs/05 S7).

    Hints ride in the *system* message while the document text goes through the
    fenced `extract.entities` template as the user message — the hints are
    admin-authored config, the document is untrusted.
    """
    hints = [r.llm_hint.strip() for r in rules if r.method == "llm" and r.llm_hint]
    if not hints:
        return _BASE_SYSTEM
    joined = "\n".join(f"- {h}" for h in hints)
    return f"{_BASE_SYSTEM}\n\nTenant-specific extraction guidance:\n{joined}"


async def _render_user_prompt(session: AsyncSession, tenant_id, corpus: str) -> str:
    """The document text, wrapped by the seeded `extract.entities` template.

    Goes through PromptService.render (not the raw template) because that is what
    sanitizes the text against forging a fence boundary and escaping into the
    instruction context.
    """
    from app.modules.ai.service import PromptService

    return await PromptService(session).render(tenant_id, PROMPT_KEY, {"text": corpus})


async def extract_entities(session: AsyncSession, tenant_id: uuid.UUID | str,
                           document, chunks: list[DocumentChunk]) -> list[ExtractedEntity]:
    config = await resolve_config(session, tenant_id, "extraction")
    threshold = config.confidence_threshold
    equipment = EquipmentService(session, tenant_id)
    rules = await load_rules(session, tenant_id)

    # (entity_type, lowercased value) → best candidate seen so far
    candidates: dict[tuple[str, str], dict] = {}

    def add(entity_type: str, value: str, page_no: int | None, confidence: float,
            rule_id: str | None = None, rule_version: int | None = None) -> None:
        value = value.strip()
        if not value:
            return
        key = (entity_type, value.lower())
        existing = candidates.get(key)
        # Highest confidence wins. Rules are applied in priority order, so an
        # equal-confidence tie keeps the earlier (higher-priority) rule's
        # provenance rather than letting the last one overwrite it.
        if existing is None or confidence > existing["confidence"]:
            candidates[key] = {"type": entity_type, "value": value, "page_no": page_no,
                               "confidence": confidence, "rule_id": rule_id,
                               "rule_version": rule_version}

    # ── pass 1: tenant rules (regex / keyword), priority order ───────────────
    for chunk in chunks:
        for rule in rules:
            try:
                for m in await apply_rule(rule, chunk.text):
                    add(m.entity_type, m.value, chunk.page_no, m.confidence,
                        m.rule_id, m.rule_version)
            except InvalidPattern as exc:
                # One bad rule must not sink the document's ingestion — skip it and
                # leave a breadcrumb pointing at the offending rule.
                log.warning("extraction_rule_skipped", rule_id=rule.id,
                            entity_type=rule.entity_type, error=str(exc))

    # ── pass 2: LLM structured output (best-effort) ──────────────────────────
    try:
        corpus = "\n".join(c.text for c in chunks)[:_LLM_CORPUS_CHARS]
        result = await structured_complete(
            session, tenant_id, "extraction",
            system=_system_with_hints(rules),
            user=await _render_user_prompt(session, tenant_id, corpus),
            schema_hint=EXTRACTION_SCHEMA)
        for ent in result.get("entities", []) or []:
            etype, val = ent.get("type"), ent.get("value")
            if etype and val:
                # No rule_id: the LLM pass is not attributable to a single rule.
                add(etype, str(val), None, float(ent.get("confidence", 0.6)))
    except Exception as exc:  # noqa: BLE001 — never fail ingestion on the LLM pass
        log.warning("llm_extraction_skipped", error=str(exc))

    # ── normalize + resolve equipment tags, build rows ───────────────────────
    rows: list[ExtractedEntity] = []
    for c in candidates.values():
        etype, value = c["type"], c["value"]
        normalized: str | None = value
        linked_type = linked_id = None
        confidence = c["confidence"]
        if etype == "equipment_tag":
            normalized = normalize_tag(value)
            matches = await equipment.resolve(value)
            if matches and matches[0]["score"] >= min(threshold, 0.5):
                best = matches[0]
                normalized = best["tag"]
                confidence = max(confidence, float(best["score"]))
                if float(best["score"]) >= threshold:
                    linked_type, linked_id = "equipment", best["id"]
        rows.append(ExtractedEntity(
            tenant_id=tenant_id, document_id=document.id, page_no=c["page_no"],
            entity_type=etype, value=value, normalized_value=normalized,
            confidence=round(confidence, 3), status="auto",
            linked_record_type=linked_type, linked_record_id=linked_id,
            rule_id=uuid.UUID(c["rule_id"]) if c["rule_id"] else None,
            rule_version=c["rule_version"]))
    return rows
