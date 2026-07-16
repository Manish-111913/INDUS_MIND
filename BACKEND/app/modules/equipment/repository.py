"""Asset repositories (docs/02 §7, §23, §50).

Tenant scoping + soft-delete filtering are applied on every query. The tree uses
a recursive CTE; resolve uses pg_trgm similarity for fuzzy tag matching
(P101 ≈ P-101 ≈ Pump-101).
"""

from __future__ import annotations

import builtins  # `list` is shadowed by a `list()` method below
import re
import uuid

from sqlalchemy import Select, and_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams, PageResult, paginate
from app.modules.equipment.models import Area, Equipment, Plant

# Health bands (health_score 0–100).
HEALTH_BANDS = {"good": (75, 100), "fair": (50, 75), "poor": (0, 50)}


def normalize_tag(value: str) -> str:
    """P-101 / P101 / p 101 → 'P101' (uppercase, alphanumerics only)."""
    return re.sub(r"[^A-Za-z0-9]", "", value or "").upper()


class PlantRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    def _base(self) -> Select:
        return select(Plant).where(Plant.tenant_id == self.tenant_id, Plant.deleted_at.is_(None))

    async def get(self, plant_id: uuid.UUID | str) -> Plant | None:
        return (await self.session.execute(self._base().where(Plant.id == plant_id))).scalar_one_or_none()

    async def get_by_code(self, code: str) -> Plant | None:
        return (await self.session.execute(self._base().where(Plant.code == code))).scalar_one_or_none()

    async def list(self, params: PageParams) -> PageResult:
        return await paginate(self.session, self._base(), params, Plant)

    async def add(self, plant: Plant) -> Plant:
        plant.tenant_id = self.tenant_id  # type: ignore[assignment]
        self.session.add(plant)
        await self.session.flush()
        return plant


class AreaRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    def _base(self) -> Select:
        return select(Area).where(Area.tenant_id == self.tenant_id, Area.deleted_at.is_(None))

    async def get(self, area_id: uuid.UUID | str) -> Area | None:
        return (await self.session.execute(self._base().where(Area.id == area_id))).scalar_one_or_none()

    async def get_by_code(self, plant_id: uuid.UUID | str, code: str) -> Area | None:
        stmt = self._base().where(Area.plant_id == plant_id, Area.code == code)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list(self, params: PageParams, *, plant_id: uuid.UUID | None) -> PageResult:
        stmt = self._base()
        if plant_id:
            stmt = stmt.where(Area.plant_id == plant_id)
        return await paginate(self.session, stmt, params, Area)

    async def list_for_plant(self, plant_id: uuid.UUID | str) -> builtins.list[Area]:
        stmt = self._base().where(Area.plant_id == plant_id).order_by(Area.code)
        return list((await self.session.execute(stmt)).scalars().all())

    async def add(self, area: Area) -> Area:
        area.tenant_id = self.tenant_id  # type: ignore[assignment]
        self.session.add(area)
        await self.session.flush()
        return area


class EquipmentRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    def _base(self) -> Select:
        return select(Equipment).where(
            Equipment.tenant_id == self.tenant_id, Equipment.deleted_at.is_(None)
        )

    async def get(self, equipment_id: uuid.UUID | str) -> Equipment | None:
        return (
            await self.session.execute(self._base().where(Equipment.id == equipment_id))
        ).scalar_one_or_none()

    async def get_by_tag(self, tag: str) -> Equipment | None:
        return (
            await self.session.execute(self._base().where(Equipment.tag == tag))
        ).scalar_one_or_none()

    async def list(
        self, params: PageParams, *, area_id: uuid.UUID | None = None,
        type_id: uuid.UUID | None = None, criticality: str | None = None,
        status: str | None = None, health_band: str | None = None, q: str | None = None,
    ) -> PageResult:
        stmt = self._base()
        if area_id:
            stmt = stmt.where(Equipment.area_id == area_id)
        if type_id:
            stmt = stmt.where(Equipment.type_id == type_id)
        if criticality:
            stmt = stmt.where(Equipment.criticality == criticality)
        if status:
            stmt = stmt.where(Equipment.status == status)
        if health_band and health_band in HEALTH_BANDS:
            lo, hi = HEALTH_BANDS[health_band]
            stmt = stmt.where(and_(Equipment.health_score >= lo, Equipment.health_score < hi))
        if q:
            like = f"%{q}%"
            stmt = stmt.where(Equipment.tag.ilike(like) | Equipment.name.ilike(like))
        return await paginate(self.session, stmt, params, Equipment)

    async def add(self, equipment: Equipment) -> Equipment:
        equipment.tenant_id = self.tenant_id  # type: ignore[assignment]
        self.session.add(equipment)
        await self.session.flush()
        return equipment

    async def tree_rows(self, plant_id: uuid.UUID | str) -> builtins.list[dict]:
        """Recursive CTE: every equipment node under a plant, with hierarchy depth."""
        sql = text(
            """
            WITH RECURSIVE tree AS (
                SELECT id, parent_id, area_id, plant_id, tag, name, type_id,
                       criticality, status, health_score, 0 AS depth
                FROM equipment
                WHERE tenant_id = :tenant AND plant_id = :plant
                  AND deleted_at IS NULL AND parent_id IS NULL
                UNION ALL
                SELECT e.id, e.parent_id, e.area_id, e.plant_id, e.tag, e.name, e.type_id,
                       e.criticality, e.status, e.health_score, tree.depth + 1
                FROM equipment e
                JOIN tree ON e.parent_id = tree.id
                WHERE e.tenant_id = :tenant AND e.deleted_at IS NULL
            )
            SELECT id, parent_id, area_id, tag, name, type_id, criticality,
                   status, health_score, depth
            FROM tree
            ORDER BY depth, tag
            """
        )
        result = await self.session.execute(sql, {"tenant": str(self.tenant_id), "plant": str(plant_id)})
        return [dict(r._mapping) for r in result]

    async def resolve(self, query: str, *, limit: int = 10, threshold: float = 0.3) -> builtins.list[dict]:
        """Fuzzy tag→equipment via pg_trgm similarity on normalized tag + name."""
        nq = normalize_tag(query)
        sql = text(
            """
            SELECT id, tag, name,
                   GREATEST(
                       similarity(upper(regexp_replace(tag, '[^A-Za-z0-9]', '', 'g')), :nq),
                       similarity(upper(name), :qu)
                   ) AS score
            FROM equipment
            WHERE tenant_id = :tenant AND deleted_at IS NULL
            ORDER BY score DESC
            LIMIT :limit
            """
        )
        result = await self.session.execute(
            sql, {"tenant": str(self.tenant_id), "nq": nq, "qu": query.upper(), "limit": limit}
        )
        rows = [dict(r._mapping) for r in result]
        return [r for r in rows if (r["score"] or 0) >= threshold]
