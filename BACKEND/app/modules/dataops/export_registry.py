"""Exportable-entity registry (docs/05 S6).

Each entity maps to a safe fetcher returning (columns, column_kinds, rows). Kinds
drive locale formatting so an export matches what the user sees on screen. Filters
are a small whitelisted dict per entity — never raw SQL.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(frozen=True)
class ExportEntitySpec:
    columns: list[str]
    kinds: dict[str, str]
    fetch: Callable[..., Any]     # async (session, tenant_id, filters) -> list[dict]
    count: Callable[..., Any]     # async (session, tenant_id, filters) -> int


async def _equipment_rows(session: AsyncSession, tenant_id, filters: dict) -> list[dict]:
    from app.modules.equipment.models import Equipment

    stmt = select(Equipment).where(Equipment.tenant_id == tenant_id,
                                   Equipment.deleted_at.is_(None))
    if filters.get("criticality"):
        stmt = stmt.where(Equipment.criticality == filters["criticality"])
    if filters.get("status"):
        stmt = stmt.where(Equipment.status == filters["status"])
    rows = (await session.execute(stmt.order_by(Equipment.tag))).scalars().all()
    return [{"tag": e.tag, "name": e.name, "criticality": e.criticality, "status": e.status,
             "manufacturer": e.manufacturer, "model": e.model,
             "health_score": e.health_score, "created_at": e.created_at} for e in rows]


async def _equipment_count(session: AsyncSession, tenant_id, filters: dict) -> int:
    from app.modules.equipment.models import Equipment

    stmt = select(func.count()).select_from(Equipment).where(
        Equipment.tenant_id == tenant_id, Equipment.deleted_at.is_(None))
    if filters.get("criticality"):
        stmt = stmt.where(Equipment.criticality == filters["criticality"])
    if filters.get("status"):
        stmt = stmt.where(Equipment.status == filters["status"])
    return (await session.execute(stmt)).scalar() or 0


async def _work_order_rows(session: AsyncSession, tenant_id, filters: dict) -> list[dict]:
    from app.modules.maintenance.models import WorkOrder

    stmt = select(WorkOrder).where(WorkOrder.tenant_id == tenant_id,
                                   WorkOrder.deleted_at.is_(None))
    if filters.get("status"):
        stmt = stmt.where(WorkOrder.status == filters["status"])
    if filters.get("priority"):
        stmt = stmt.where(WorkOrder.priority == filters["priority"])
    rows = (await session.execute(stmt.order_by(WorkOrder.wo_number))).scalars().all()
    return [{"wo_number": w.wo_number, "title": w.title, "type": w.type, "priority": w.priority,
             "status": w.status, "due_at": w.due_at, "closed_at": w.closed_at,
             "labor_hours": w.labor_hours, "created_at": w.created_at} for w in rows]


async def _work_order_count(session: AsyncSession, tenant_id, filters: dict) -> int:
    from app.modules.maintenance.models import WorkOrder

    stmt = select(func.count()).select_from(WorkOrder).where(
        WorkOrder.tenant_id == tenant_id, WorkOrder.deleted_at.is_(None))
    if filters.get("status"):
        stmt = stmt.where(WorkOrder.status == filters["status"])
    if filters.get("priority"):
        stmt = stmt.where(WorkOrder.priority == filters["priority"])
    return (await session.execute(stmt)).scalar() or 0


REGISTRY: dict[str, ExportEntitySpec] = {
    "equipment": ExportEntitySpec(
        columns=["tag", "name", "criticality", "status", "manufacturer", "model",
                 "health_score", "created_at"],
        kinds={"health_score": "number", "created_at": "date"},
        fetch=_equipment_rows, count=_equipment_count),
    "work_orders": ExportEntitySpec(
        columns=["wo_number", "title", "type", "priority", "status", "due_at", "closed_at",
                 "labor_hours", "created_at"],
        kinds={"due_at": "date", "closed_at": "date", "created_at": "date",
               "labor_hours": "number"},
        fetch=_work_order_rows, count=_work_order_count),
}


def get_spec(entity: str) -> ExportEntitySpec:
    spec = REGISTRY.get(entity)
    if spec is None:
        from app.core.exceptions import ValidationFailed

        raise ValidationFailed(f"Unknown export entity '{entity}'", code="EXPORT_ENTITY_UNKNOWN",
                               http_status=422)
    return spec
