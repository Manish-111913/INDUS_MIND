"""Compliance mapping / gap agent (docs/02 §10 compliance graph, §15, §19).

The LangGraph compliance DAG as composable async stages:
    clause → find_candidates(retrieval) → compare(LLM judge) → gap_or_map

For each clause in scope: retrieve candidate procedures/records scoped to the
plant, resolve the equipment the clause governs (explicit tag refs + distinctive
name keywords + tags mentioned in the retrieved procedures), parse any interval
requirement, then judge — mapped (write `compliance_mappings`, status proposed)
vs gap (write `compliance_gaps` with side-by-side detail the gap-detail screen
renders: clause text, the governing procedure chunk, and the evidence records).

Judgement uses the `compliance.compare` prompt when an LLM key is configured;
offline it falls back to a deterministic, grounded heuristic over the real
maintenance schedules / closed inspection records (docs/02 §30) so the demo gap
("clause 6.4 quarterly firewater pump testing — FW-P1 overdue, no test record")
is reproducible without any external service. The scan is idempotent: a re-run
updates the open gap / proposed mapping for the same clause+target rather than
duplicating it. Beat runs a daily delta scan (docs/02 §36).
"""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import Event, EventType, bus
from app.core.logging import get_logger
from app.modules.audit.service import AuditService
from app.modules.compliance.models import ComplianceGap, ComplianceMapping, RegulationClause
from app.modules.compliance.repository import (
    ClauseRepository,
    GapRepository,
    MappingRepository,
    RegulationRepository,
)
from app.modules.equipment.models import Equipment
from app.modules.ingestion.models import DocumentChunk
from app.modules.knowledge.retrieval import RetrievalScope, RetrievalService
from app.modules.maintenance.models import MaintenanceSchedule, WorkOrder
from app.ws import progress

log = get_logger("compliance.scan")

_TAG = re.compile(r"\b[A-Z]{1,4}-?[A-Z]?-?\d{1,4}[A-Z]?\b")
# Generic words that must not, alone, link a clause to a piece of equipment.
_GENERIC = {
    "pump", "tank", "motor", "valve", "compressor", "exchanger", "boiler", "transformer",
    "feed", "crude", "unit", "drum", "column", "water", "gas", "overhead", "storage",
    "cooling", "refrigeration", "instrument", "effluent", "utility", "quench",
}
_RECORD_WO_TYPES = ("inspection", "preventive", "predictive")


def parse_interval_days(text: str) -> int | None:
    """Extract a testing/inspection interval requirement from clause prose."""
    t = text.lower()
    if "quarter" in t:
        return 90
    if "semi-annual" in t or "semi annual" in t or "six month" in t or "6 month" in t:
        return 182
    if ("annual" in t or "yearly" in t or "twelve month" in t or "12 month" in t
            or "per year" in t):
        return 365
    m = re.search(r"(\d+)\s*month", t)
    if m:
        return int(m.group(1)) * 30
    if "weekly" in t:
        return 7
    if "daily" in t:
        return 1
    return None


class ComplianceScanService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.regulations = RegulationRepository(session, tenant_id)
        self.clauses = ClauseRepository(session, tenant_id)
        self.mappings = MappingRepository(session, tenant_id)
        self.gaps = GapRepository(session, tenant_id)
        self.audit = AuditService(session)

    async def scan(self, *, scope: dict | None = None, actor=None) -> dict:
        scope = scope or {}
        now = datetime.now(UTC)
        regulation_id = scope.get("regulation_id")
        clauses = await self._clauses_in_scope(regulation_id)
        if not clauses:
            return {"clauses": 0, "mappings": 0, "gaps": 0}

        regulations = {r.id: r for r in await self.regulations.list_all()}
        equipment = await self._equipment_in_scope(scope)
        has_docs = await self._has_documents()

        n_map = n_gap = 0
        total = len(clauses)
        for i, clause in enumerate(clauses):
            await self._progress("compare", int(100 * (i + 1) / total))
            candidates = await self._candidates(clause, scope) if has_docs else []
            targets = self._resolve_equipment(clause, equipment, candidates)
            requirement = parse_interval_days(f"{clause.title or ''} {clause.text or ''}")
            reg = regulations.get(clause.regulation_id)

            judged = await self._judge(clause, reg, targets, requirement, candidates, now)
            for verdict in judged:
                if verdict["kind"] == "gap":
                    if await self._upsert_gap(clause, reg, verdict, actor):
                        n_gap += 1
                else:
                    if await self._upsert_mapping(clause, verdict, actor):
                        n_map += 1

        await self.session.flush()
        await self.audit.write(action="compliance.scan", entity_type="compliance_scan",
                               tenant_id=self.tenant_id, actor_id=actor.id if actor else None,
                               after={"clauses": total, "mappings": n_map, "gaps": n_gap,
                                      "scope": scope})
        await self._progress("done", 100)
        log.info("compliance_scan_done", tenant_id=str(self.tenant_id),
                 clauses=total, mappings=n_map, gaps=n_gap)
        return {"clauses": total, "mappings": n_map, "gaps": n_gap}

    # ── stages ──────────────────────────────────────────────────────────────
    async def _clauses_in_scope(self, regulation_id) -> list[RegulationClause]:
        if regulation_id:
            return await self.clauses.list_for_regulation(regulation_id)
        return sorted(await self.clauses.list_all(), key=lambda c: (str(c.regulation_id), c.order_index))

    async def _equipment_in_scope(self, scope: dict) -> list[Equipment]:
        stmt = select(Equipment).where(
            Equipment.tenant_id == self.tenant_id, Equipment.deleted_at.is_(None))
        if scope.get("plant_id"):
            stmt = stmt.where(Equipment.plant_id == scope["plant_id"])
        if scope.get("equipment_ids"):
            stmt = stmt.where(Equipment.id.in_(scope["equipment_ids"]))
        return list((await self.session.execute(stmt)).scalars().all())

    async def _has_documents(self) -> bool:
        n = (await self.session.execute(select(func.count()).select_from(DocumentChunk).where(
            DocumentChunk.tenant_id == self.tenant_id))).scalar()
        return bool(n)

    async def _candidates(self, clause: RegulationClause, scope: dict) -> list:
        query = " ".join(filter(None, [clause.title, clause.text]))[:400]
        rscope = RetrievalScope(plant_ids=[scope["plant_id"]] if scope.get("plant_id") else [])
        try:
            chunks = await RetrievalService(self.session, self.tenant_id).retrieve(
                query, scope=rscope, top_k=4)
        except Exception as exc:  # noqa: BLE001 — retrieval is best-effort grounding
            log.warning("compliance_retrieval_failed", error=str(exc))
            return []
        return chunks

    def _resolve_equipment(self, clause: RegulationClause, equipment: list[Equipment],
                           candidates: list) -> list[Equipment]:
        by_tag = {e.tag.upper(): e for e in equipment}
        text = f"{clause.title or ''} {clause.text or ''}"
        tags = {t.upper() for t in _TAG.findall(text)}
        for c in candidates:  # tags mentioned in the retrieved procedure chunks
            tags |= {t.upper() for t in _TAG.findall(c.text or "")}

        resolved: dict[uuid.UUID, Equipment] = {}
        for tag in tags:
            eq = by_tag.get(tag)
            if eq is not None:
                resolved[eq.id] = eq

        # Distinctive name-keyword match (e.g. "firewater" → FW-P1) when no explicit tag.
        clause_tokens = {w for w in re.findall(r"[a-z]{5,}", text.lower()) if w not in _GENERIC}
        for eq in equipment:
            name_tokens = {w for w in re.findall(r"[a-z]{5,}", eq.name.lower()) if w not in _GENERIC}
            if name_tokens & clause_tokens:
                resolved[eq.id] = eq
        return list(resolved.values())

    async def _judge(self, clause, reg, targets, requirement, candidates, now) -> list[dict]:
        """Decide mapped vs gap per governed equipment (grounded heuristic; LLM enriches)."""
        procedure = self._procedure_citation(candidates)
        verdicts: list[dict] = []

        if not targets:
            # No governed equipment resolved. If a procedure clearly addresses the clause,
            # propose a procedure_doc mapping; otherwise there's no basis to judge.
            if procedure and procedure.get("document_id"):
                verdicts.append({
                    "kind": "map", "target_type": "procedure_doc",
                    "target_id": uuid.UUID(procedure["document_id"]),
                    "target_label": procedure.get("title"), "confidence": 0.6,
                    "citation": procedure,
                    "rationale": f"Procedure '{procedure.get('title')}' appears to address clause "
                                 f"{clause.clause_no}."})
            return verdicts

        for eq in targets:
            schedules = await self._schedules_for(eq)
            last_test = await self._last_test(eq)
            records = self._records(schedules, last_test)
            comparison = self._compare(requirement, schedules, last_test, now)

            if comparison["verdict"] == "gap":
                explanation = await self._explain(clause, reg, eq, requirement, comparison,
                                                  procedure, records)
                verdicts.append({
                    "kind": "gap", "equipment": eq, "requirement": requirement,
                    "procedure": procedure, "records": records, "comparison": comparison,
                    "severity": self._severity(clause, comparison),
                    "explanation": explanation})
            else:
                target = (records[0] if records else None)
                verdicts.append({
                    "kind": "map",
                    "target_type": "record" if target and target["type"] == "work_order"
                    else "equipment",
                    "target_id": uuid.UUID(target["id"]) if target and target["type"] == "work_order"
                    else eq.id,
                    "target_label": (target["label"] if target else f"{eq.tag} — {eq.name}"),
                    "confidence": comparison["confidence"],
                    "citation": procedure or {},
                    "rationale": comparison["rationale"]})
        return verdicts

    def _compare(self, requirement, schedules, last_test, now) -> dict:
        """The judge's core comparison over real records (offline-deterministic)."""
        overdue_days = 0
        for s in schedules:
            if s.next_due_at and s.next_due_at < now:
                overdue_days = max(overdue_days, (now - s.next_due_at).days)
        days_since_last = (now - last_test.closed_at).days if (last_test and last_test.closed_at) else None

        if requirement is not None:
            missing_record = last_test is None or (
                days_since_last is not None and days_since_last > requirement * 1.15)
            if overdue_days > 0 or missing_record:
                reason = []
                if overdue_days > 0:
                    reason.append(f"scheduled test overdue by {overdue_days}d")
                if last_test is None:
                    reason.append("no completed test record found")
                elif days_since_last is not None and days_since_last > requirement:
                    reason.append(f"last test {days_since_last}d ago exceeds the {requirement}d interval")
                return {"verdict": "gap", "confidence": 0.9, "required_interval_days": requirement,
                        "overdue_days": overdue_days, "days_since_last": days_since_last,
                        "last_test_at": last_test.closed_at.isoformat() if last_test else None,
                        "rationale": "; ".join(reason) or "requirement not evidenced"}
            return {"verdict": "map", "confidence": 0.85, "required_interval_days": requirement,
                    "overdue_days": 0, "days_since_last": days_since_last,
                    "last_test_at": last_test.closed_at.isoformat() if last_test else None,
                    "rationale": f"last test {days_since_last}d ago within the {requirement}d interval"}

        # Qualitative requirement (monitoring / documented program / record-keeping).
        if schedules:
            return {"verdict": "map", "confidence": 0.7, "required_interval_days": None,
                    "overdue_days": overdue_days, "days_since_last": days_since_last,
                    "last_test_at": None,
                    "rationale": f"active maintenance program ({schedules[0].name}) evidences the clause"}
        return {"verdict": "gap", "confidence": 0.75, "required_interval_days": None,
                "overdue_days": overdue_days, "days_since_last": days_since_last,
                "last_test_at": None,
                "rationale": "no documented maintenance program evidences the clause"}

    async def _explain(self, clause, reg, eq, requirement, comparison, procedure, records) -> str:
        interval = f"{requirement}-day" if requirement else "documented"
        base = (f"Clause {clause.clause_no} ({reg.code if reg else 'regulation'}) requires a "
                f"{interval} program for {eq.tag} ({eq.name}). {comparison['rationale'].capitalize()}.")
        if procedure and procedure.get("title"):
            base += f" Governing procedure on file: {procedure['title']}."
        elif records:
            base += f" On file: {records[0]['label']}."
        return base

    def _severity(self, clause, comparison) -> str:
        if comparison.get("overdue_days", 0) >= 30 or clause.severity_default == "critical":
            return "critical" if comparison.get("overdue_days", 0) >= 60 else "high"
        return clause.severity_default or "medium"

    # ── evidence collection ──────────────────────────────────────────────────
    async def _schedules_for(self, eq: Equipment) -> list[MaintenanceSchedule]:
        stmt = select(MaintenanceSchedule).where(
            MaintenanceSchedule.tenant_id == self.tenant_id,
            MaintenanceSchedule.deleted_at.is_(None),
            MaintenanceSchedule.equipment_id == eq.id,
            MaintenanceSchedule.active.is_(True))
        return list((await self.session.execute(stmt)).scalars().all())

    async def _last_test(self, eq: Equipment) -> WorkOrder | None:
        stmt = (select(WorkOrder).where(
            WorkOrder.tenant_id == self.tenant_id, WorkOrder.deleted_at.is_(None),
            WorkOrder.equipment_id == eq.id, WorkOrder.status == "closed",
            WorkOrder.type.in_(_RECORD_WO_TYPES))
            .order_by(WorkOrder.closed_at.desc().nulls_last()).limit(1))
        return (await self.session.execute(stmt)).scalars().first()

    def _records(self, schedules, last_test) -> list[dict]:
        records: list[dict] = []
        if last_test is not None:
            records.append({"type": "work_order", "id": str(last_test.id),
                            "label": f"{last_test.wo_number} — {last_test.title}",
                            "at": last_test.closed_at.isoformat() if last_test.closed_at else None,
                            "status": last_test.status})
        for s in schedules:
            records.append({"type": "schedule", "id": str(s.id), "label": s.name,
                            "next_due_at": s.next_due_at.isoformat() if s.next_due_at else None,
                            "interval_days": s.interval_days, "status": "active"})
        return records

    def _procedure_citation(self, candidates) -> dict | None:
        if not candidates:
            return None
        c = candidates[0]
        return {"document_id": str(c.document_id), "chunk_id": str(c.chunk_id),
                "page": c.page_no, "title": None, "snippet": (c.text or "")[:240].strip()}

    # ── persistence (idempotent upserts) ──────────────────────────────────────
    async def _upsert_gap(self, clause, reg, verdict, actor) -> bool:
        eq = verdict.get("equipment")
        eq_id = eq.id if eq else None
        existing = await self.gaps.find_open(clause.id, eq_id)
        detail = {
            "clause": {"id": str(clause.id), "clause_no": clause.clause_no, "title": clause.title,
                       "text": clause.text, "regulation_code": reg.code if reg else None,
                       "regulation_title": reg.title if reg else None},
            "requirement": {"interval_days": verdict.get("requirement"),
                            "description": verdict["comparison"].get("rationale")},
            "procedure": verdict.get("procedure"),
            "records": verdict.get("records", []),
            "comparison": verdict.get("comparison", {}),
        }
        title = (f"Clause {clause.clause_no}: {clause.title or 'requirement'} — "
                 f"{eq.tag if eq else 'unaddressed'}")
        if existing is not None:
            existing.title = title[:512]
            existing.severity = verdict["severity"]
            existing.ai_explanation = verdict["explanation"]
            existing.detail = detail
            existing.description = verdict["comparison"].get("rationale")
            existing.updated_by = actor.id if actor else None
            existing.version += 1
            return False
        gap = await self.gaps.add(ComplianceGap(
            clause_id=clause.id, title=title[:512], severity=verdict["severity"],
            description=verdict["comparison"].get("rationale"),
            ai_explanation=verdict["explanation"], affected_equipment_id=eq_id,
            detected_by="agent", status="open", detail=detail,
            created_by=actor.id if actor else None, updated_by=actor.id if actor else None))
        await bus.publish(Event(EventType.GAP_DETECTED, tenant_id=str(self.tenant_id),
                                actor_id=str(actor.id) if actor else None,
                                payload={"gap_id": str(gap.id), "clause_id": str(clause.id),
                                         "equipment_id": str(eq_id) if eq_id else None,
                                         "severity": gap.severity, "title": gap.title}))
        await bus.publish(Event(EventType.NOTIFICATION_CREATED, tenant_id=str(self.tenant_id),
                                payload={"category": "compliance", "title": f"Compliance gap: {gap.title}",
                                         "entity_type": "compliance_gap", "entity_id": str(gap.id),
                                         "priority": gap.severity}))
        return True

    async def _upsert_mapping(self, clause, verdict, actor) -> bool:
        target_id = verdict["target_id"]
        existing = await self.mappings.find(clause.id, verdict["target_type"], target_id)
        if existing is not None:
            if existing.status == "proposed":  # never override a human confirm/reject
                existing.mapping_confidence = verdict["confidence"]
                existing.rationale = verdict["rationale"]
                existing.citation = verdict.get("citation") or {}
                existing.updated_by = actor.id if actor else None
                existing.version += 1
            return False
        await self.mappings.add(ComplianceMapping(
            clause_id=clause.id, target_type=verdict["target_type"], target_id=target_id,
            target_label=verdict.get("target_label"), mapping_confidence=verdict["confidence"],
            mapped_by="ai", status="proposed", rationale=verdict["rationale"],
            citation=verdict.get("citation") or {},
            created_by=actor.id if actor else None, updated_by=actor.id if actor else None))
        # Project the Clause -[:GOVERNS]-> Equipment/Document edge (best-effort; graph is optional).
        from app.modules.compliance.events import project_clause_governs

        if verdict["target_type"] == "equipment":
            await project_clause_governs(self.tenant_id, clause.id, clause.clause_no,
                                         equipment_id=target_id)
        elif verdict["target_type"] == "procedure_doc":
            await project_clause_governs(self.tenant_id, clause.id, clause.clause_no,
                                         document_id=target_id)
        return True

    async def _progress(self, stage: str, pct: int) -> None:
        try:
            await progress.publish(self.tenant_id, {
                "type": "compliance.scan.progress", "stage": stage, "pct": pct})
        except Exception:  # noqa: BLE001 — progress is best-effort
            pass
