"""Compliance services (docs/02 §7, §19, §31, §34).

No business logic in routers. Every mutation writes an audit row; gap detection /
confirmation publish typed events. Regulations/clauses/gaps/audits are CRUD;
mappings are AI-proposed then human confirm/reject; a gap can spawn a remediation
work order (source=gap) via the maintenance service; coverage returns the
regulation × area matrix that backs the heatmap.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams, PageResult
from app.core.events import Event, EventType, bus
from app.core.exceptions import ConflictError, NotFound, ValidationFailed, VersionMismatch
from app.modules.audit.service import AuditService
from app.modules.compliance.models import (
    Audit,
    ComplianceGap,
    ComplianceMapping,
    Regulation,
    RegulationClause,
)
from app.modules.compliance.repository import (
    AuditRepository,
    ClauseRepository,
    GapRepository,
    MappingRepository,
    RegulationRepository,
    clause_counts,
)
from app.modules.equipment.repository import EquipmentRepository

_PRIORITY_FOR_SEVERITY = {"critical": "critical", "high": "high", "medium": "medium", "low": "low"}


def _check_version(entity, expected: int | None) -> None:
    if expected is not None and getattr(entity, "version", None) != expected:
        raise VersionMismatch()


class RegulationService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = RegulationRepository(session, tenant_id)
        self.clauses = ClauseRepository(session, tenant_id)
        self.audit = AuditService(session)

    async def list(self, params: PageParams, **filters) -> PageResult:
        return await self.repo.list(params, **filters)

    async def get(self, regulation_id: uuid.UUID) -> Regulation:
        reg = await self.repo.get(regulation_id)
        if reg is None:
            raise NotFound("Regulation not found", code="REGULATION_NOT_FOUND")
        return reg

    async def create(self, *, data, actor) -> Regulation:
        if await self.repo.get_by_code(data.code) is not None:
            raise ConflictError("Regulation code already exists", code="REGULATION_CODE_EXISTS")
        reg = await self.repo.add(Regulation(
            code=data.code, title=data.title, body=data.body,
            source_document_id=data.source_document_id, effective_date=data.effective_date,
            edition=data.edition, status="active", created_by=actor.id, updated_by=actor.id))
        await self.audit.write(action="compliance.regulation_create", entity_type="regulation",
                               entity_id=reg.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"code": reg.code})
        return reg

    async def update(self, regulation_id: uuid.UUID, *, data, actor) -> Regulation:
        reg = await self.get(regulation_id)
        _check_version(reg, data.version)
        for field in ("code", "title", "body", "effective_date", "edition", "status"):
            value = getattr(data, field)
            if value is not None:
                setattr(reg, field, value)
        reg.version += 1
        reg.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="compliance.regulation_update", entity_type="regulation",
                               entity_id=reg.id, tenant_id=self.tenant_id, actor_id=actor.id)
        return reg

    async def delete(self, regulation_id: uuid.UUID, *, actor) -> None:
        reg = await self.get(regulation_id)
        reg.deleted_at = func.now()
        reg.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="compliance.regulation_delete", entity_type="regulation",
                               entity_id=reg.id, tenant_id=self.tenant_id, actor_id=actor.id)

    async def clauses_for(self, regulation_id: uuid.UUID) -> list[RegulationClause]:
        await self.get(regulation_id)
        return await self.clauses.list_for_regulation(regulation_id)


class ClauseService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = ClauseRepository(session, tenant_id)
        self.regulations = RegulationRepository(session, tenant_id)
        self.audit = AuditService(session)

    async def get(self, clause_id: uuid.UUID) -> RegulationClause:
        clause = await self.repo.get(clause_id)
        if clause is None:
            raise NotFound("Clause not found", code="CLAUSE_NOT_FOUND")
        return clause

    async def create(self, *, data, actor) -> RegulationClause:
        if await self.regulations.get(data.regulation_id) is None:
            raise ValidationFailed("Unknown regulation_id", code="VALIDATION_ERROR", http_status=422,
                                   field_errors={"regulation_id": "Regulation not found"})
        clause = await self.repo.add(RegulationClause(
            regulation_id=data.regulation_id, clause_no=data.clause_no, parent_id=data.parent_id,
            title=data.title, text=data.text, category=data.category,
            severity_default=data.severity_default, order_index=data.order_index,
            path=data.clause_no, created_by=actor.id, updated_by=actor.id))
        await self.audit.write(action="compliance.clause_create", entity_type="regulation_clause",
                               entity_id=clause.id, tenant_id=self.tenant_id, actor_id=actor.id)
        return clause

    async def update(self, clause_id: uuid.UUID, *, data, actor) -> RegulationClause:
        clause = await self.get(clause_id)
        _check_version(clause, data.version)
        for field in ("clause_no", "parent_id", "title", "text", "category", "severity_default",
                      "order_index"):
            value = getattr(data, field)
            if value is not None:
                setattr(clause, field, value)
        clause.version += 1
        clause.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="compliance.clause_update", entity_type="regulation_clause",
                               entity_id=clause.id, tenant_id=self.tenant_id, actor_id=actor.id)
        return clause

    async def delete(self, clause_id: uuid.UUID, *, actor) -> None:
        clause = await self.get(clause_id)
        clause.deleted_at = func.now()
        clause.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="compliance.clause_delete", entity_type="regulation_clause",
                               entity_id=clause.id, tenant_id=self.tenant_id, actor_id=actor.id)


class MappingService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = MappingRepository(session, tenant_id)
        self.clauses = ClauseRepository(session, tenant_id)
        self.audit = AuditService(session)

    async def list(self, params: PageParams, **filters) -> PageResult:
        return await self.repo.list(params, **filters)

    async def get(self, mapping_id: uuid.UUID) -> ComplianceMapping:
        mapping = await self.repo.get(mapping_id)
        if mapping is None:
            raise NotFound("Mapping not found", code="MAPPING_NOT_FOUND")
        return mapping

    async def create(self, *, data, actor) -> ComplianceMapping:
        if await self.clauses.get(data.clause_id) is None:
            raise ValidationFailed("Unknown clause_id", code="VALIDATION_ERROR", http_status=422,
                                   field_errors={"clause_id": "Clause not found"})
        if data.target_type not in ("procedure_doc", "equipment", "record"):
            raise ValidationFailed("Invalid target_type", code="VALIDATION_ERROR", http_status=422,
                                   field_errors={"target_type": "Must be procedure_doc|equipment|record"})
        existing = await self.repo.find(data.clause_id, data.target_type, data.target_id)
        if existing is not None:
            raise ConflictError("Mapping already exists for this clause + target",
                                code="MAPPING_EXISTS")
        mapping = await self.repo.add(ComplianceMapping(
            clause_id=data.clause_id, target_type=data.target_type, target_id=data.target_id,
            target_label=data.target_label, mapping_confidence=data.mapping_confidence,
            mapped_by="human", status="confirmed", rationale=data.rationale,
            created_by=actor.id, updated_by=actor.id))
        await self.audit.write(action="compliance.mapping_create", entity_type="compliance_mapping",
                               entity_id=mapping.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"status": mapping.status})
        return mapping

    async def set_status(self, mapping_id: uuid.UUID, *, status: str, version, actor) -> ComplianceMapping:
        mapping = await self.get(mapping_id)
        _check_version(mapping, version)
        before = mapping.status
        mapping.status = status
        if status in ("confirmed", "rejected"):
            mapping.mapped_by = "human"
        mapping.version += 1
        mapping.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="compliance.mapping_status", entity_type="compliance_mapping",
                               entity_id=mapping.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               before={"status": before}, after={"status": status})
        return mapping


class GapService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = GapRepository(session, tenant_id)
        self.clauses = ClauseRepository(session, tenant_id)
        self.equipment = EquipmentRepository(session, tenant_id)
        self.audit = AuditService(session)

    async def list(self, params: PageParams, **filters) -> PageResult:
        return await self.repo.list(params, **filters)

    async def get(self, gap_id: uuid.UUID) -> ComplianceGap:
        gap = await self.repo.get(gap_id)
        if gap is None:
            raise NotFound("Gap not found", code="GAP_NOT_FOUND")
        return gap

    async def create(self, *, data, actor) -> ComplianceGap:
        if data.clause_id is not None and await self.clauses.get(data.clause_id) is None:
            raise ValidationFailed("Unknown clause_id", code="VALIDATION_ERROR", http_status=422,
                                   field_errors={"clause_id": "Clause not found"})
        gap = await self.repo.add(ComplianceGap(
            clause_id=data.clause_id, title=data.title, severity=data.severity,
            description=data.description, ai_explanation=data.ai_explanation,
            affected_equipment_id=data.affected_equipment_id,
            affected_document_id=data.affected_document_id, owner_id=data.owner_id,
            due_at=data.due_at, detected_by="manual", status="open",
            created_by=actor.id, updated_by=actor.id))
        await self.audit.write(action="compliance.gap_create", entity_type="compliance_gap",
                               entity_id=gap.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"title": gap.title, "detected_by": "manual"})
        await bus.publish(Event(EventType.GAP_DETECTED, tenant_id=str(self.tenant_id),
                                actor_id=str(actor.id),
                                payload={"gap_id": str(gap.id), "severity": gap.severity,
                                         "title": gap.title, "detected_by": "manual"}))
        return gap

    async def update(self, gap_id: uuid.UUID, *, data, actor) -> ComplianceGap:
        gap = await self.get(gap_id)
        _check_version(gap, data.version)
        for field in ("title", "severity", "description", "owner_id", "due_at"):
            value = getattr(data, field)
            if value is not None:
                setattr(gap, field, value)
        if data.status is not None:
            gap.status = data.status
            if data.status in ("resolved", "accepted_risk") and gap.resolved_at is None:
                gap.resolved_at = datetime.now(UTC)
        gap.version += 1
        gap.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="compliance.gap_update", entity_type="compliance_gap",
                               entity_id=gap.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"status": gap.status})
        return gap

    async def delete(self, gap_id: uuid.UUID, *, actor) -> None:
        gap = await self.get(gap_id)
        gap.deleted_at = func.now()
        gap.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="compliance.gap_delete", entity_type="compliance_gap",
                               entity_id=gap.id, tenant_id=self.tenant_id, actor_id=actor.id)

    async def create_remediation(self, gap_id: uuid.UUID, *, actor) -> tuple[ComplianceGap, uuid.UUID]:
        from app.modules.maintenance.schemas import WorkOrderCreate
        from app.modules.maintenance.service import WorkOrderService

        gap = await self.get(gap_id)
        if gap.remediation_wo_id is not None:
            raise ConflictError("A remediation work order already exists for this gap",
                                code="REMEDIATION_EXISTS")
        priority = _PRIORITY_FOR_SEVERITY.get(gap.severity, "medium")
        wo = await WorkOrderService(self.session, self.tenant_id).create(
            data=WorkOrderCreate(
                title=f"Remediate compliance gap: {gap.title[:200]}",
                description=gap.ai_explanation or gap.description,
                equipment_id=gap.affected_equipment_id, type="corrective", priority=priority),
            actor=actor, source="gap")
        gap.remediation_wo_id = wo.id
        gap.status = "in_remediation"
        gap.version += 1
        gap.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="compliance.gap_remediation", entity_type="compliance_gap",
                               entity_id=gap.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"work_order_id": str(wo.id)})
        return gap, wo.id


class AuditService_:
    """Compliance `audits` CRUD (distinct from the audit-log AuditService)."""

    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = AuditRepository(session, tenant_id)
        self.audit = AuditService(session)

    async def list(self, params: PageParams, **filters) -> PageResult:
        return await self.repo.list(params, **filters)

    async def get(self, audit_id: uuid.UUID) -> Audit:
        audit = await self.repo.get(audit_id)
        if audit is None:
            raise NotFound("Audit not found", code="AUDIT_NOT_FOUND")
        return audit

    async def create(self, *, data, actor) -> Audit:
        audit = await self.repo.add(Audit(
            name=data.name, body=data.body, scheduled_at=data.scheduled_at, auditor=data.auditor,
            scope=data.scope, checklist=data.checklist, status="planned",
            created_by=actor.id, updated_by=actor.id))
        await self.audit.write(action="compliance.audit_create", entity_type="audit",
                               entity_id=audit.id, tenant_id=self.tenant_id, actor_id=actor.id)
        return audit

    async def update(self, audit_id: uuid.UUID, *, data, actor) -> Audit:
        audit = await self.get(audit_id)
        _check_version(audit, data.version)
        for field in ("name", "body", "scheduled_at", "auditor", "scope", "status", "checklist"):
            value = getattr(data, field)
            if value is not None:
                setattr(audit, field, value)
        audit.version += 1
        audit.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="compliance.audit_update", entity_type="audit",
                               entity_id=audit.id, tenant_id=self.tenant_id, actor_id=actor.id)
        return audit

    async def delete(self, audit_id: uuid.UUID, *, actor) -> None:
        audit = await self.get(audit_id)
        audit.deleted_at = func.now()
        audit.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="compliance.audit_delete", entity_type="audit",
                               entity_id=audit.id, tenant_id=self.tenant_id, actor_id=actor.id)


class CoverageService:
    """Regulation × area coverage matrix for the heatmap (docs/02 §19)."""

    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.regulations = RegulationRepository(session, tenant_id)
        self.clauses = ClauseRepository(session, tenant_id)
        self.gaps = GapRepository(session, tenant_id)

    async def compute(self, *, scope: dict | None = None) -> dict:
        from app.modules.equipment.models import Area, Equipment

        counts = await clause_counts(self.session, self.tenant_id)
        regulations = await self.regulations.list_all()

        # per-regulation summary
        reg_summary: list[dict] = []
        reg_by_id = {r.id: r for r in regulations}
        for reg in regulations:
            clauses = await self.clauses.list_for_regulation(reg.id)
            mapped = gapped = 0
            for c in clauses:
                if counts["gaps"].get(c.id):
                    gapped += 1
                elif counts["mapped"].get(c.id):
                    mapped += 1
            total = len(clauses)
            reg_summary.append({"regulation_id": str(reg.id), "regulation_code": reg.code,
                                "regulation_title": reg.title, "clauses": total, "mapped": mapped,
                                "gaps": gapped, "unaddressed": total - mapped - gapped,
                                "coverage_pct": round(100.0 * mapped / total, 1) if total else 0.0})

        # areas + equipment → area map
        from sqlalchemy import select

        areas = list((await self.session.execute(select(Area).where(
            Area.tenant_id == self.tenant_id, Area.deleted_at.is_(None)))).scalars().all())
        eq_area = {e.id: e.area_id for e in (await self.session.execute(select(Equipment).where(
            Equipment.tenant_id == self.tenant_id, Equipment.deleted_at.is_(None)))).scalars().all()}
        clause_reg = {c.id: c.regulation_id for c in await self.clauses.list_all()}

        # matrix cell keyed by (regulation_id, area_id) → gap count
        matrix: dict[tuple, int] = {}
        for gap in await self.gaps.list_all():
            if gap.status in ("resolved", "accepted_risk") or not gap.clause_id:
                continue
            reg_id = clause_reg.get(gap.clause_id)
            area_id = eq_area.get(gap.affected_equipment_id) if gap.affected_equipment_id else None
            if reg_id is None:
                continue
            matrix[(str(reg_id), str(area_id) if area_id else None)] = \
                matrix.get((str(reg_id), str(area_id) if area_id else None), 0) + 1

        cells = [{"regulation_id": rid, "regulation_code": reg_by_id[uuid.UUID(rid)].code
                  if uuid.UUID(rid) in reg_by_id else None,
                  "area_id": aid, "gaps": n}
                 for (rid, aid), n in matrix.items()]
        return {
            "regulations": reg_summary,
            "areas": [{"id": str(a.id), "code": a.code, "name": a.name} for a in areas],
            "matrix": cells,
        }
