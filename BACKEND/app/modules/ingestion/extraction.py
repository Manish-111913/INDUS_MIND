"""Entity extraction (docs/02 §10 step 6).

Hybrid: (1) a regex/gazetteer pass over chunk text for equipment tags, clause
refs, dates, persons and parameters; (2) an LLM structured-output pass per
document (best-effort — degrades to regex-only when no API key is configured).
Equipment tags are normalized and resolved against the equipment registry
(fuzzy); a resolve score below the config's confidence_threshold leaves the
entity unlinked and in `auto` (human-review) status.
"""

from __future__ import annotations

import re
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.llm import resolve_config, structured_complete
from app.core.logging import get_logger
from app.modules.equipment.repository import normalize_tag
from app.modules.equipment.service import EquipmentService
from app.modules.ingestion.models import DocumentChunk, ExtractedEntity

log = get_logger("ingestion.extraction")

# equipment-tag candidates (docs/02 §10): P-101, P101, C-3, TK-01, FUR-1, FW-P1 …
_TAG = re.compile(r"\b[A-Z]{1,4}-?[A-Z]?-?\d{1,4}[A-Z]?\b")
_CLAUSE = re.compile(
    r"\b(OISD-STD-\d+|OISD-\d+|IS-\d+|SOP-\d+|Factory Act|PESO)\b(?:[\s,]*(?:clause\s*)?"
    r"(\d+(?:\.\d+)+))?", re.IGNORECASE)
_DATE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")
_PERSON = re.compile(r"\b[A-Z]\.\s?[A-Z][a-z]{2,}\b")
_PARAM = re.compile(r"\b\d+(?:\.\d+)?\s?(?:Nm|m3/h|barg?|kW|rpm|mm/s|ppm|tph|mmkcal|MVA|kV)\b",
                    re.IGNORECASE)

EXTRACTION_SCHEMA = ('{"entities":[{"type":"equipment_tag|parameter|regulation_ref|person|'
                     'date|material|failure_mode|procedure_ref","value":"string",'
                     '"confidence":0.0}]}')


async def extract_entities(session: AsyncSession, tenant_id: uuid.UUID | str,
                           document, chunks: list[DocumentChunk]) -> list[ExtractedEntity]:
    config = await resolve_config(session, tenant_id, "extraction")
    threshold = config.confidence_threshold
    equipment = EquipmentService(session, tenant_id)

    # candidate → (entity_type, value, page_no, confidence)
    candidates: dict[tuple[str, str], dict] = {}

    def add(entity_type: str, value: str, page_no: int | None, confidence: float) -> None:
        value = value.strip()
        if not value:
            return
        key = (entity_type, value.lower())
        if key not in candidates or confidence > candidates[key]["confidence"]:
            candidates[key] = {"type": entity_type, "value": value, "page_no": page_no,
                               "confidence": confidence}

    # ── pass 1: regex / gazetteer ────────────────────────────────────────────
    for chunk in chunks:
        text, page = chunk.text, chunk.page_no
        for m in _TAG.finditer(text):
            add("equipment_tag", m.group(0), page, 0.55)
        for m in _CLAUSE.finditer(text):
            ref = m.group(1) + (" " + m.group(2) if m.group(2) else "")
            add("regulation_ref", ref, page, 0.8)
        for m in _DATE.finditer(text):
            add("date", m.group(0), page, 0.9)
        for m in _PERSON.finditer(text):
            add("person", m.group(0), page, 0.5)
        for m in _PARAM.finditer(text):
            add("parameter", m.group(0), page, 0.7)

    # ── pass 2: LLM structured output (best-effort) ──────────────────────────
    try:
        corpus = "\n".join(c.text for c in chunks)[:6000]
        result = await structured_complete(
            session, tenant_id, "extraction",
            system="You extract industrial entities from maintenance/engineering text.",
            user=f"Extract entities from:\n{corpus}", schema_hint=EXTRACTION_SCHEMA)
        for ent in result.get("entities", []) or []:
            etype, val = ent.get("type"), ent.get("value")
            if etype and val:
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
            linked_record_type=linked_type, linked_record_id=linked_id))
    return rows
