"""Quality services (docs/02 §7, §21, §34).

NCR CRUD (lookup-validated defect types, no cross-module FKs) + defect Pareto /
deviation-rate trends over the seeded data. Creating an NCR emits `ncr.created`
so the lessons agent can inspect for an emerging repeat-defect pattern.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams, PageResult
from app.core.events import Event, EventType, bus
from app.core.exceptions import NotFound, ValidationFailed, VersionMismatch
from app.modules.audit.service import AuditService
from app.modules.equipment.repository import EquipmentRepository
from app.modules.lookups.service import LookupService
from app.modules.quality.models import NCR
from app.modules.quality.repository import NCRRepository


def _check_version(entity, expected: int | None) -> None:
    if expected is not None and getattr(entity, "version", None) != expected:
        raise VersionMismatch()


class NCRService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = NCRRepository(session, tenant_id)
        self.equipment = EquipmentRepository(session, tenant_id)
        self.audit = AuditService(session)

    async def list(self, params: PageParams, **filters) -> PageResult:
        return await self.repo.list(params, **filters)

    async def get(self, ncr_id: uuid.UUID) -> NCR:
        ncr = await self.repo.get(ncr_id)
        if ncr is None:
            raise NotFound("NCR not found", code="NCR_NOT_FOUND")
        return ncr

    async def _validate(self, *, equipment_id, defect_type_id) -> None:
        field_errors: dict[str, str] = {}
        if equipment_id is not None and await self.equipment.get(equipment_id) is None:
            field_errors["equipment_id"] = "Equipment not found"
        if defect_type_id is not None:
            ids = {r.id for r in await LookupService(self.session, self.tenant_id)
                   .by_category("defect_types")}
            if defect_type_id not in ids:
                field_errors["defect_type_id"] = "Unknown defect type"
        if field_errors:
            raise ValidationFailed("Invalid references", code="VALIDATION_ERROR", http_status=422,
                                   field_errors=field_errors)

    async def create(self, *, data, actor) -> NCR:
        await self._validate(equipment_id=data.equipment_id, defect_type_id=data.defect_type_id)
        detected_at = data.detected_at or datetime.now(UTC)
        ncr = await self.repo.add(NCR(
            ncr_number=await self.repo.next_number(year=detected_at.year), area_id=data.area_id,
            line=data.line, defect_type_id=data.defect_type_id, severity=data.severity,
            description=data.description, equipment_id=data.equipment_id, status="open",
            capa=data.capa, detected_at=detected_at,
            created_by=actor.id, updated_by=actor.id))
        await self.audit.write(action="ncr.create", entity_type="ncr", entity_id=ncr.id,
                               tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"ncr_number": ncr.ncr_number})
        await bus.publish(Event(EventType.NCR_CREATED, tenant_id=str(self.tenant_id),
                                actor_id=str(actor.id),
                                payload={"ncr_id": str(ncr.id),
                                         "equipment_id": str(ncr.equipment_id) if ncr.equipment_id else None,
                                         "defect_type_id": str(ncr.defect_type_id) if ncr.defect_type_id else None,
                                         "line": ncr.line,
                                         "area_id": str(ncr.area_id) if ncr.area_id else None}))
        return ncr

    async def update(self, ncr_id: uuid.UUID, *, data, actor) -> NCR:
        ncr = await self.get(ncr_id)
        _check_version(ncr, data.version)
        await self._validate(equipment_id=data.equipment_id, defect_type_id=data.defect_type_id)
        for field in ("area_id", "line", "defect_type_id", "severity", "description",
                      "equipment_id", "capa"):
            value = getattr(data, field)
            if value is not None:
                setattr(ncr, field, value)
        if data.status is not None:
            ncr.status = data.status
            if data.status == "closed" and ncr.closed_at is None:
                ncr.closed_at = datetime.now(UTC)
        ncr.version += 1
        ncr.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="ncr.update", entity_type="ncr", entity_id=ncr.id,
                               tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"status": ncr.status})
        return ncr

    async def delete(self, ncr_id: uuid.UUID, *, actor) -> None:
        ncr = await self.get(ncr_id)
        ncr.deleted_at = func.now()
        ncr.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="ncr.delete", entity_type="ncr", entity_id=ncr.id,
                               tenant_id=self.tenant_id, actor_id=actor.id)


class QualityTrendsService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = NCRRepository(session, tenant_id)

    async def compute(self) -> dict:
        total = await self.repo.total()
        defect_labels = {r.id: r.label for r in await LookupService(self.session, self.tenant_id)
                         .by_category("defect_types")}

        # Defect Pareto: counts by defect type, descending, with cumulative %.
        pareto: list[dict] = []
        cumulative = 0
        for defect_id, n in await self.repo.defect_counts():
            cumulative += n
            pareto.append({
                "defect_type_id": str(defect_id) if defect_id else None,
                "defect_type": defect_labels.get(defect_id, "Unclassified"),
                "count": n,
                "pct": round(100.0 * n / total, 1) if total else 0.0,
                "cumulative_pct": round(100.0 * cumulative / total, 1) if total else 0.0,
            })

        # Deviation rate by area (share of NCRs) — area labels resolved from equipment module.
        area_labels = await self._area_labels()
        by_area = [{"area_id": str(a) if a else None,
                    "area": area_labels.get(a, "Unassigned"), "ncrs": n,
                    "rate_pct": round(100.0 * n / total, 1) if total else 0.0}
                   for a, n in await self.repo.counts_by(NCR.area_id)]

        by_line = [{"line": line or "Unassigned", "ncrs": n,
                    "rate_pct": round(100.0 * n / total, 1) if total else 0.0}
                   for line, n in await self.repo.counts_by(NCR.line)]
        by_severity = [{"severity": s, "count": n} for s, n in await self.repo.counts_by(NCR.severity)]
        by_status = [{"status": s, "count": n} for s, n in await self.repo.counts_by(NCR.status)]

        return {"total": total, "defect_pareto": pareto, "deviation_rate_by_area": by_area,
                "deviation_rate_by_line": by_line, "by_severity": by_severity, "by_status": by_status}

    async def _area_labels(self) -> dict:
        from app.modules.equipment.models import Area

        rows = (await self.session.execute(select(Area).where(
            Area.tenant_id == self.tenant_id, Area.deleted_at.is_(None)))).scalars().all()
        return {a.id: a.name for a in rows}
