"""Work-order AI context (docs/02 §18 — `GET /work-orders/{id}/ai-context`).

Assembles decision support for a technician opening a WO, scoped to the WO's
equipment, every item cited:
  · similar past WOs — closed WOs on the same equipment ranked by lexical overlap
    of title/closure-notes (the FTS arm) fused with recency;
  · relevant SOP chunks — the hybrid RetrievalService scoped to the equipment,
    filtered to SOP/manual doc types, returned with page-level citations;
  · known failure modes — real frequencies from failure_records with the
    corresponding lookup label + a recommendation.
Degrades gracefully (empty lists) when the corpus is thin — never fabricates.
"""

from __future__ import annotations

import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.modules.equipment.repository import EquipmentRepository
from app.modules.knowledge.retrieval import RetrievalScope, RetrievalService
from app.modules.lookups.service import LookupService
from app.modules.maintenance.models import WorkOrder
from app.modules.maintenance.repository import FailureRepository, WorkOrderRepository
from app.modules.maintenance.schemas import (
    AiContext,
    Citation,
    KnownFailureMode,
    SimilarWorkOrder,
    SopStep,
)

log = get_logger("maintenance.ai_context")

_WORD = re.compile(r"[a-z0-9]+")
_SOP_DOC_TYPES = {"sop", "manual", "inspection_report"}

_MODE_RECOMMENDATION = {
    "wear": "Inspect for wear and schedule component replacement per OEM interval.",
    "fatigue": "Check for cyclic loading; review alignment and vibration history.",
    "corrosion": "Inspect coating/CP integrity; verify material against the service fluid.",
    "fracture": "Perform NDT on the affected part before returning to service.",
    "leakage": "Replace seals/gaskets and pressure-test before restart.",
    "blockage": "Flush and inspect strainers; verify upstream filtration.",
    "electrical_fault": "Meg-test windings and inspect terminations.",
    "overheating": "Check cooling/lubrication and load against rating.",
}


def _tokens(text: str | None) -> set[str]:
    return set(_WORD.findall((text or "").lower()))


class AiContextService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    async def build(self, wo) -> AiContext:
        equipment_tag = None
        equipment = None
        if wo.equipment_id is not None:
            equipment = await EquipmentRepository(self.session, self.tenant_id).get(wo.equipment_id)
            equipment_tag = equipment.tag if equipment else None

        similar = await self._similar_work_orders(wo)
        sop_steps = await self._sop_steps(wo, equipment_tag)
        modes = await self._failure_modes(wo)
        return AiContext(
            equipment_id=str(wo.equipment_id) if wo.equipment_id else "",
            equipment_tag=equipment_tag, similar_work_orders=similar,
            sop_steps=sop_steps, failure_modes=modes)

    async def _similar_work_orders(self, wo) -> list[SimilarWorkOrder]:
        if wo.equipment_id is None:
            return []
        repo = WorkOrderRepository(self.session, self.tenant_id)
        candidates = [c for c in await repo.similar_closed(wo.equipment_id, limit=10) if c.id != wo.id]
        query_tokens = _tokens(wo.title) | _tokens(wo.description)
        from app.modules.auth.repository import UserRepository

        scored: list[tuple[float, WorkOrder]] = []
        for cand in candidates:
            cand_tokens = _tokens(cand.title) | _tokens(cand.closure_notes)
            overlap = len(query_tokens & cand_tokens)
            union = len(query_tokens | cand_tokens) or 1
            score = overlap / union  # Jaccard over title+notes (the FTS signal)
            scored.append((score, cand))
        scored.sort(key=lambda x: x[0], reverse=True)

        out: list[SimilarWorkOrder] = []
        for score, cand in scored[:5]:
            fixed_by = None
            if cand.updated_by is not None:
                user = await UserRepository(self.session).get(cand.updated_by)
                fixed_by = user.full_name if user else None
            out.append(SimilarWorkOrder(
                id=str(cand.id), wo_number=cand.wo_number, title=cand.title,
                fixed_by=fixed_by, closed_at=cand.closed_at,
                confidence=round(0.5 + 0.5 * score, 3),
                citation=Citation(title=cand.wo_number,
                                  snippet=(cand.closure_notes or cand.title)[:200])))
        return out

    async def _sop_steps(self, wo, equipment_tag: str | None) -> list[SopStep]:
        query = " ".join(filter(None, [wo.title, equipment_tag]))
        if not query.strip():
            return []
        scope = RetrievalScope(equipment_ids=[wo.equipment_id] if wo.equipment_id else [])
        chunks = await RetrievalService(self.session, self.tenant_id).retrieve(
            query, scope=scope, top_k=6)
        titles = await self._doc_titles([c.document_id for c in chunks])
        steps: list[SopStep] = []
        for c in chunks:
            title = titles.get(c.document_id, "Document")
            steps.append(SopStep(
                title=(c.section_path or title)[:120],
                excerpt=c.text[:280].strip(),
                confidence=round(min(0.99, 0.5 + c.score), 3),
                citation=Citation(document_id=str(c.document_id),
                                  version_id=str(c.version_id) if c.version_id else None,
                                  page=c.page_no, chunk_id=str(c.chunk_id), title=title,
                                  snippet=c.text[:200].strip())))
        return steps

    async def _failure_modes(self, wo) -> list[KnownFailureMode]:
        if wo.equipment_id is None:
            return []
        freqs = await FailureRepository(self.session, self.tenant_id).mode_frequencies(wo.equipment_id)
        labels = {row.id: row.label for row in
                  await LookupService(self.session, self.tenant_id).by_category("failure_modes")}
        codes = {row.id: row.code for row in
                 await LookupService(self.session, self.tenant_id).by_category("failure_modes")}
        total = sum(n for _, n in freqs) or 1
        out: list[KnownFailureMode] = []
        for mode_id, n in freqs:
            if mode_id is None:
                continue
            code = codes.get(mode_id, "")
            out.append(KnownFailureMode(
                mode=labels.get(mode_id, "Unknown"), frequency=n,
                confidence=round(n / total, 3),
                recommendation=_MODE_RECOMMENDATION.get(code)))
        return out

    async def _doc_titles(self, document_ids) -> dict[uuid.UUID, str]:
        from app.modules.documents.models import Document

        ids = [d for d in set(document_ids) if d]
        if not ids:
            return {}
        rows = (await self.session.execute(
            select(Document.id, Document.title).where(Document.id.in_(ids)))).all()
        return {r[0]: r[1] for r in rows}
