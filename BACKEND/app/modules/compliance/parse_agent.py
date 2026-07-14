"""Regulation clause-parsing agent (docs/02 §10, §19).

`POST /compliance/regulations/import {document_id}` runs this over an ingested
regulation document: gather the document's chunks → LLM structured extraction
(prompt `compliance.parse_clauses`) into a clause tree → persist
`regulation_clauses`. When no LLM key is configured a deterministic regex parser
extracts numbered clauses ("Clause 6.4: …") so the pipeline still runs offline
(docs/02 §30) — the seam and contract stay identical. Clause `parent_id`/`path`
are derived from the dotted clause numbering (6.4 → parent 6).
"""

from __future__ import annotations

import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import llm
from app.core.config import settings
from app.core.exceptions import NotFound, ValidationFailed
from app.core.logging import get_logger
from app.modules.audit.service import AuditService
from app.modules.compliance.models import Regulation, RegulationClause
from app.modules.compliance.repository import ClauseRepository, RegulationRepository
from app.modules.documents.models import Document
from app.modules.ingestion.models import DocumentChunk

log = get_logger("compliance.parse")

# "Clause 6.4: …" / "6.4 …" up to the next clause marker or end-of-text.
_CLAUSE_RE = re.compile(
    r"(?:clause\s+)?(?P<no>\d+(?:\.\d+)+)\s*[:.\)]\s*(?P<body>.+?)(?=(?:clause\s+)?\d+(?:\.\d+)+\s*[:.\)]|$)",
    re.IGNORECASE | re.DOTALL,
)
_SENT = re.compile(r"(?<=[.!?])\s+")


def parse_clauses_regex(text: str) -> list[dict]:
    """Deterministic offline parser: numbered clauses from raw regulation text."""
    clauses: list[dict] = []
    seen: set[str] = set()
    for m in _CLAUSE_RE.finditer(text):
        no = m.group("no").strip()
        if no in seen:
            continue
        seen.add(no)
        body = " ".join(m.group("body").split())
        title = _SENT.split(body)[0][:120].rstrip(" .") if body else no
        clauses.append({"clause_no": no, "title": title, "text": body,
                        "category": None, "severity": "medium"})
    return clauses


class RegulationImportService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.regulations = RegulationRepository(session, tenant_id)
        self.clauses = ClauseRepository(session, tenant_id)
        self.audit = AuditService(session)

    async def import_document(self, *, document_id: uuid.UUID, actor,
                              code: str | None = None, title: str | None = None,
                              body: str | None = None) -> tuple[Regulation, int]:
        document = (await self.session.execute(select(Document).where(
            Document.id == document_id, Document.tenant_id == self.tenant_id,
            Document.deleted_at.is_(None)))).scalar_one_or_none()
        if document is None:
            raise NotFound("Document not found", code="DOCUMENT_NOT_FOUND")

        full_text = await self._document_text(document_id)
        if not full_text.strip():
            raise ValidationFailed("Document has no ingested text to parse — ingest it first",
                                   code="DOCUMENT_NOT_INGESTED", http_status=422)

        parsed = await self._parse(full_text)
        if not parsed:
            raise ValidationFailed("No clauses could be parsed from the document",
                                   code="NO_CLAUSES_PARSED", http_status=422)

        regulation = await self._upsert_regulation(document, code, title, body, actor)
        created = await self._persist_clauses(regulation, parsed, actor)

        await self.audit.write(action="compliance.regulation_import", entity_type="regulation",
                               entity_id=regulation.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"document_id": str(document_id), "clauses": created})
        # Project the clause nodes into the graph (best-effort; graph is optional).
        from app.modules.compliance.events import project_regulation

        await project_regulation(self.tenant_id, regulation,
                                 await self.clauses.list_for_regulation(regulation.id))
        return regulation, created

    # ── stages ────────────────────────────────────────────────────────────────
    async def _document_text(self, document_id: uuid.UUID) -> str:
        chunks = (await self.session.execute(
            select(DocumentChunk)
            .where(DocumentChunk.document_id == document_id,
                   DocumentChunk.tenant_id == self.tenant_id)
            .order_by(DocumentChunk.chunk_index))).scalars().all()
        return "\n".join(c.text for c in chunks)

    async def _parse(self, text: str) -> list[dict]:
        template_present = await self._has_prompt()
        if (settings.anthropic_api_key or settings.openai_api_key) and template_present:
            from app.modules.ai.service import PromptService

            rendered = await PromptService(self.session).render(
                self.tenant_id, "compliance.parse_clauses", {"document": text[:12000]})
            result = await llm.structured_complete(
                self.session, self.tenant_id, "compliance",
                system=rendered, user="Extract the clause tree.",
                schema_hint='{"clauses":[{"clause_no":"6.4","title":"...","text":"...",'
                            '"category":"...","severity":"medium"}]}')
            clauses = result.get("clauses") if isinstance(result, dict) else None
            if clauses:
                return [{"clause_no": str(c.get("clause_no", "")).strip(),
                         "title": (c.get("title") or "")[:512],
                         "text": c.get("text") or "",
                         "category": c.get("category"),
                         "severity": c.get("severity") or "medium"}
                        for c in clauses if c.get("clause_no")]
        # Offline / no-key fallback.
        return parse_clauses_regex(text)

    async def _has_prompt(self) -> bool:
        from app.modules.ai.repository import PromptRepository

        return await PromptRepository(self.session).active(
            self.tenant_id, "compliance.parse_clauses") is not None

    async def _upsert_regulation(self, document: Document, code, title, body, actor) -> Regulation:
        existing = None
        if document.id is not None:
            existing = (await self.session.execute(select(Regulation).where(
                Regulation.tenant_id == self.tenant_id,
                Regulation.source_document_id == document.id,
                Regulation.deleted_at.is_(None)))).scalar_one_or_none()
        if existing is not None:
            return existing
        code = code or _code_from_title(document.title)
        if await self.regulations.get_by_code(code) is not None:
            code = f"{code}-{str(document.id)[:8]}"
        return await self.regulations.add(Regulation(
            code=code, title=title or document.title, body=body or _body_from_title(document.title),
            source_document_id=document.id, status="active",
            created_by=actor.id, updated_by=actor.id))

    async def _persist_clauses(self, regulation: Regulation, parsed: list[dict], actor) -> int:
        # First pass: create every clause; second pass: wire parent_id/path from numbering.
        by_no: dict[str, RegulationClause] = {}
        for idx, c in enumerate(parsed):
            no = c["clause_no"]
            existing = await self.clauses.get_by_no(regulation.id, no)
            if existing is not None:
                by_no[no] = existing
                continue
            clause = await self.clauses.add(RegulationClause(
                regulation_id=regulation.id, clause_no=no, title=c.get("title"),
                text=c.get("text") or "", category=c.get("category"),
                severity_default=c.get("severity") or "medium", order_index=idx,
                created_by=actor.id, updated_by=actor.id))
            by_no[no] = clause

        for no, clause in by_no.items():
            parent_no = no.rsplit(".", 1)[0] if "." in no else None
            parent = by_no.get(parent_no) if parent_no else None
            clause.parent_id = parent.id if parent else None
            clause.path = f"{parent_no} > {no}" if parent else no
        await self.session.flush()
        return len(by_no)


def _code_from_title(title: str) -> str:
    m = re.search(r"([A-Z]{2,}[-\s]?[A-Z]*[-\s]?\d+)", title or "")
    return (m.group(1).replace(" ", "-") if m else (title or "REG")[:32]).upper()


def _body_from_title(title: str) -> str:
    t = (title or "").lower()
    if "oisd" in t:
        return "oisd"
    if "factory" in t:
        return "factory_act"
    if "peso" in t:
        return "peso"
    if "iso" in t:
        return "iso"
    if "environment" in t or "env" in t:
        return "env"
    return "internal"
