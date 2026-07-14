"""Quality repositories (docs/02 §7, §21).

Tenant + soft-delete scoping. Trend aggregates (defect Pareto, deviation rate by
line/area) run real GROUP BY SQL over the seeded NCRs — no placeholder numbers.
"""

from __future__ import annotations

import uuid

from sqlalchemy import Integer, Select, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams, PageResult, paginate
from app.modules.quality.models import NCR


class NCRRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    def _base(self) -> Select:
        return select(NCR).where(NCR.tenant_id == self.tenant_id, NCR.deleted_at.is_(None))

    async def get(self, ncr_id: uuid.UUID | str) -> NCR | None:
        return (await self.session.execute(
            self._base().where(NCR.id == ncr_id))).scalar_one_or_none()

    async def list(self, params: PageParams, *, status: str | None = None,
                   severity: str | None = None, area_id: uuid.UUID | None = None,
                   equipment_id: uuid.UUID | None = None,
                   defect_type_id: uuid.UUID | None = None) -> PageResult:
        stmt = self._base()
        if status:
            stmt = stmt.where(NCR.status == status)
        if severity:
            stmt = stmt.where(NCR.severity == severity)
        if area_id:
            stmt = stmt.where(NCR.area_id == area_id)
        if equipment_id:
            stmt = stmt.where(NCR.equipment_id == equipment_id)
        if defect_type_id:
            stmt = stmt.where(NCR.defect_type_id == defect_type_id)
        stmt = stmt.order_by(NCR.detected_at.desc())
        return await paginate(self.session, stmt, params, NCR)

    async def recent_for_equipment(self, equipment_id: uuid.UUID | str, *,
                                   defect_type_id: uuid.UUID | None = None) -> list[NCR]:
        stmt = self._base().where(NCR.equipment_id == equipment_id)
        if defect_type_id is not None:
            stmt = stmt.where(NCR.defect_type_id == defect_type_id)
        return list((await self.session.execute(stmt.order_by(NCR.detected_at.desc()))).scalars().all())

    async def next_number(self, *, year: int) -> str:
        stmt = (select(func.max(cast(func.substring(NCR.ncr_number, r"(\d+)$"), Integer)))
                .where(NCR.tenant_id == self.tenant_id, NCR.ncr_number.like(f"NCR-{year}-%")))
        current = (await self.session.execute(stmt)).scalar()
        return f"NCR-{year}-{(int(current or 0) + 1):03d}"

    async def add(self, ncr: NCR) -> NCR:
        ncr.tenant_id = self.tenant_id  # type: ignore[assignment]
        self.session.add(ncr)
        await self.session.flush()
        return ncr

    # ── trends ────────────────────────────────────────────────────────────────
    async def defect_counts(self) -> list[tuple[uuid.UUID | None, int]]:
        stmt = (select(NCR.defect_type_id, func.count().label("n"))
                .where(NCR.tenant_id == self.tenant_id, NCR.deleted_at.is_(None))
                .group_by(NCR.defect_type_id).order_by(func.count().desc()))
        return [(r[0], r[1]) for r in (await self.session.execute(stmt)).all()]

    async def counts_by(self, column) -> list[tuple]:
        stmt = (select(column, func.count().label("n"))
                .where(NCR.tenant_id == self.tenant_id, NCR.deleted_at.is_(None))
                .group_by(column).order_by(func.count().desc()))
        return [(r[0], r[1]) for r in (await self.session.execute(stmt)).all()]

    async def total(self) -> int:
        return (await self.session.execute(select(func.count()).select_from(NCR).where(
            NCR.tenant_id == self.tenant_id, NCR.deleted_at.is_(None)))).scalar() or 0
