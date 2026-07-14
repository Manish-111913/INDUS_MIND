"""RCA agent (docs/02 §10 agent orchestration, §15).

Staged graph (the LangGraph RCA DAG as composable async stages):
  gather → hypothesize → evidence_check → format

gather pulls the failure + equipment history (via the maintenance services) and
manual/inspection chunks (via the shared RetrievalService). hypothesize ranks
probable causes (prompt `rca.hypothesize`; extractive fallback offline).
evidence_check DROPS any cause without ≥1 cited chunk/record. format also builds
a five-why ladder and fishbone categories for the frontend RCA canvas. Publishing
emits a lessons-learned candidate and can spawn corrective work orders.
"""

from __future__ import annotations

import re
import uuid
from collections import Counter

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import Event, EventType, bus
from app.core.exceptions import ConflictError, NotFound
from app.core.logging import get_logger
from app.modules.ai.repository import PromptRepository
from app.modules.audit.service import AuditService
from app.modules.equipment.models import Equipment
from app.modules.knowledge.retrieval import RetrievalScope, RetrievalService
from app.modules.maintenance.models import RCAAnalysis
from app.modules.maintenance.repository import (
    FailureRepository,
    RCARepository,
    WorkOrderRepository,
)
from app.ws import progress

log = get_logger("ai.rca")

_SENT = re.compile(r"(?<=[.!?])\s+")
_CATEGORY_KEYWORDS = {
    "Machine": ["seal", "bearing", "vibration", "wear", "impeller", "rotor", "coupling", "mechanical"],
    "Method": ["procedure", "flush", "alignment", "install", "schedule", "pm", "torque", "assembly"],
    "Material": ["corrosion", "material", "gasket", "oil", "lubric", "metallurgy", "fouling"],
    "Measurement": ["calibrat", "gauge", "monitor", "sensor", "instrument", "reading"],
    "Man": ["operator", "human", "training", "manual error"],
    "Environment": ["temperature", "monsoon", "weather", "ambient", "humidity", "startup"],
}


class RCAService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.failures = FailureRepository(session, tenant_id)
        self.work_orders = WorkOrderRepository(session, tenant_id)
        self.repo = RCARepository(session, tenant_id)
        self.audit = AuditService(session)

    async def run(self, failure_id: uuid.UUID, *, actor=None) -> RCAAnalysis:
        failure = await self.failures.get(failure_id)
        if failure is None:
            raise NotFound("Failure record not found", code="FAILURE_NOT_FOUND")

        await self._progress(failure_id, "gather", 15)
        equipment = await self._equipment(failure.equipment_id)
        history = await self.failures.list_for_equipment(failure.equipment_id) if failure.equipment_id else []
        closed_wos = await self.work_orders.similar_closed(failure.equipment_id) if failure.equipment_id else []
        chunks = await self._retrieve(equipment, failure)

        await self._progress(failure_id, "hypothesize", 45)
        causes, prompt_version = await self._hypothesize(equipment, failure, history, closed_wos, chunks)

        await self._progress(failure_id, "evidence_check", 70)
        causes = [c for c in causes if c.get("evidence")]  # drop unsupported causes
        causes.sort(key=lambda c: c["confidence"], reverse=True)
        causes = causes[:5]

        await self._progress(failure_id, "format", 90)
        five_why = self._five_why(equipment, failure, causes)
        fishbone = self._fishbone(causes)
        confidence = round(sum(c["confidence"] for c in causes) / len(causes), 3) if causes else 0.0

        analysis = await self.repo.add(RCAAnalysis(
            failure_id=failure.id, method="agent", status="draft",
            ai_output={"causes": causes}, five_why=five_why, fishbone=fishbone,
            confidence=confidence, prompt_version=prompt_version,
            created_by=actor.id if actor else None, updated_by=actor.id if actor else None))
        failure.rca_status = "in_progress"
        await self.session.flush()
        await self.audit.write(action="rca.run", entity_type="rca_analysis", entity_id=analysis.id,
                               tenant_id=self.tenant_id, actor_id=actor.id if actor else None,
                               after={"failure_id": str(failure.id), "causes": len(causes)})
        await self._progress(failure_id, "done", 100)
        return analysis

    # ── stages ───────────────────────────────────────────────────────────────
    async def _retrieve(self, equipment, failure):
        query = " ".join(filter(None, [
            equipment.tag if equipment else None, equipment.name if equipment else None,
            failure.description or "", "root cause failure"]))
        scope = RetrievalScope(equipment_ids=[failure.equipment_id] if failure.equipment_id else [])
        chunks = await RetrievalService(self.session, self.tenant_id).retrieve(query, scope=scope, top_k=6)
        if not chunks:  # fall back to unscoped retrieval if nothing links to the equipment yet
            chunks = await RetrievalService(self.session, self.tenant_id).retrieve(query, top_k=6)
        return chunks

    async def _hypothesize(self, equipment, failure, history, closed_wos, chunks):
        template = await PromptRepository(self.session).active(self.tenant_id, "rca.hypothesize")
        prompt_version = template.version if template else None
        # (Real LLM path renders rca.hypothesize; offline we build grounded causes.)
        tag = equipment.tag if equipment else "the equipment"
        causes: list[dict] = []

        # 1. recurring dominant failure mode across history
        modes = Counter(f.failure_mode_id for f in history if f.failure_mode_id)
        if modes:
            dom_id, dom_n = modes.most_common(1)[0]
            if dom_n >= 2:
                ev = [{"type": "failure", "id": str(f.id), "snippet": (f.description or "")[:160]}
                      for f in history if f.failure_mode_id == dom_id][:3]
                causes.append({
                    "cause": f"Systemic recurring failure mode on {tag} ({dom_n} occurrences) — "
                             "points to an unresolved root cause rather than isolated events.",
                    "confidence": 0.85, "evidence": ev})

        # 2. manual / inspection evidence from retrieval
        titles = await self._titles({c.document_id for c in chunks})
        top = chunks[0].score if chunks else 1.0
        for c in chunks[:3]:
            causes.append({
                "cause": f"Per {titles.get(c.document_id, 'source')}: {_first_sentence(c.text)}",
                "confidence": round(0.5 + 0.3 * (c.score / top), 3),
                "evidence": [{"type": "document", "document_id": str(c.document_id),
                              "chunk_id": str(c.chunk_id), "page": c.page_no,
                              "snippet": c.text[:180].strip()}]})

        # 3. prior remediation from closed work orders
        for wo in closed_wos[:2]:
            if wo.closure_notes:
                causes.append({
                    "cause": f"Prior remediation ({wo.wo_number}): {wo.closure_notes[:140]}",
                    "confidence": 0.6,
                    "evidence": [{"type": "work_order", "id": str(wo.id),
                                  "snippet": wo.closure_notes[:180]}]})
        return causes, prompt_version

    def _five_why(self, equipment, failure, causes) -> list[dict]:
        tag = equipment.tag if equipment else "equipment"
        ladder = [{"why": f"Why did {tag} fail?",
                   "because": failure.description or (causes[0]["cause"] if causes else "unknown")}]
        for c in causes[:4]:
            ladder.append({"why": "Why did that occur?", "because": c["cause"]})
        return ladder

    def _fishbone(self, causes) -> dict:
        buckets: dict[str, list[str]] = {k: [] for k in _CATEGORY_KEYWORDS}
        for c in causes:
            text = c["cause"].lower()
            category = next((cat for cat, kws in _CATEGORY_KEYWORDS.items()
                             if any(k in text for k in kws)), "Machine")
            buckets[category].append(c["cause"])
        return {k: v for k, v in buckets.items() if v}

    # ── reads / human-in-loop / publish ──────────────────────────────────────
    async def get_latest(self, failure_id: uuid.UUID) -> RCAAnalysis:
        analysis = await self.repo.latest_for_failure(failure_id)
        if analysis is None:
            raise NotFound("No RCA for this failure yet", code="RCA_NOT_FOUND")
        return analysis

    async def get(self, analysis_id: uuid.UUID) -> RCAAnalysis:
        analysis = await self.repo.get(analysis_id)
        if analysis is None:
            raise NotFound("RCA analysis not found", code="RCA_NOT_FOUND")
        return analysis

    async def update(self, analysis_id: uuid.UUID, *, data, actor) -> RCAAnalysis:
        analysis = await self.get(analysis_id)
        if analysis.status == "published":
            raise ConflictError("Published RCA cannot be edited", code="RCA_PUBLISHED")
        if data.root_cause_final is not None:
            analysis.root_cause_final = data.root_cause_final
        if data.corrective_actions is not None:
            analysis.corrective_actions = data.corrective_actions
        if data.human_edits is not None:
            analysis.human_edits = data.human_edits
        if data.five_why is not None:
            analysis.five_why = data.five_why
        analysis.status = "edited"
        analysis.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="rca.update", entity_type="rca_analysis", entity_id=analysis.id,
                               tenant_id=self.tenant_id, actor_id=actor.id)
        return analysis

    async def publish(self, analysis_id: uuid.UUID, *, spawn_work_orders: bool, actor) -> RCAAnalysis:
        from datetime import UTC, datetime

        analysis = await self.get(analysis_id)
        if analysis.status == "published":
            raise ConflictError("RCA already published", code="RCA_ALREADY_PUBLISHED")
        analysis.status = "published"
        analysis.published_at = datetime.now(UTC)  # Python value → serializable without refresh
        analysis.published_by = actor.id
        failure = await self.failures.get(analysis.failure_id)
        if failure is not None:
            failure.rca_status = "published"

        spawned: list[str] = []
        if spawn_work_orders and analysis.corrective_actions and failure is not None:
            from app.modules.maintenance.schemas import WorkOrderCreate
            from app.modules.maintenance.service import WorkOrderService

            wo_svc = WorkOrderService(self.session, self.tenant_id)
            for action in analysis.corrective_actions:
                title = action.get("action") if isinstance(action, dict) else str(action)
                if not title:
                    continue
                wo = await wo_svc.create(data=WorkOrderCreate(
                    title=f"CAPA: {title[:200]}", description="From published RCA corrective action.",
                    equipment_id=failure.equipment_id, type="corrective", priority="high"),
                    actor=actor, source="rca")
                spawned.append(str(wo.id))

        await self.session.flush()
        await self.audit.write(action="rca.publish", entity_type="rca_analysis", entity_id=analysis.id,
                               tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"work_orders": spawned})
        await bus.publish(Event(EventType.RCA_PUBLISHED, tenant_id=str(self.tenant_id),
                                actor_id=str(actor.id),
                                payload={"rca_id": str(analysis.id),
                                         "failure_id": str(analysis.failure_id),
                                         "equipment_id": str(failure.equipment_id) if failure else None,
                                         "spawned_work_orders": spawned}))
        return analysis

    # ── helpers ──────────────────────────────────────────────────────────────
    async def _equipment(self, equipment_id) -> Equipment | None:
        if not equipment_id:
            return None
        return (await self.session.execute(
            select(Equipment).where(Equipment.id == equipment_id))).scalar_one_or_none()

    async def _titles(self, ids):
        from app.modules.documents.models import Document

        if not ids:
            return {}
        rows = (await self.session.execute(select(Document).where(Document.id.in_(ids)))).scalars()
        return {d.id: d.title for d in rows}

    async def _progress(self, failure_id, stage: str, pct: int) -> None:
        try:
            await progress.publish(self.tenant_id, {
                "type": "rca.progress", "failure_id": str(failure_id), "stage": stage, "pct": pct})
        except Exception:  # noqa: BLE001 — progress is best-effort
            pass


def _first_sentence(text: str, limit: int = 200) -> str:
    text = " ".join(text.split())
    parts = _SENT.split(text)
    out = parts[0] if parts else text
    return (out[:limit].rstrip(" .") + ".") if out else ""
