"""Maintenance providers wired into the cross-module registries (docs/02 §2, §18, §23, §27).

Registering these (on import of this module) makes maintenance data appear in
places owned by other modules WITHOUT cross-module table joins:
  · `WorkOrderHistoryProvider`/`FailureHistoryProvider` → equipment 360° timeline
    (`GET /equipment/{id}/history` now includes WOs + failures — the B3 interface);
  · `MaintenanceMetricsProvider` → equipment metrics (real MTBF/MTTR/backlog);
  · `WorkOrderSearchProvider` → federated search / suggest (B7).
"""

from __future__ import annotations

import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.equipment.providers import history_registry, metrics_registry
from app.modules.equipment.schemas import TimelineEvent
from app.modules.knowledge.providers import federated_registry
from app.modules.maintenance.models import WorkOrder
from app.modules.maintenance.repository import (
    FailureRepository,
    MetricsRepository,
    WorkOrderRepository,
)


class WorkOrderHistoryProvider:
    source = "work_order"

    async def fetch(self, session, tenant_id, equipment_id) -> list[TimelineEvent]:
        wos = await WorkOrderRepository(session, tenant_id).list_for_equipment(equipment_id)
        events: list[TimelineEvent] = []
        for wo in wos:
            ts = wo.closed_at or wo.started_at or wo.created_at
            events.append(TimelineEvent(
                source="work_order",
                type=f"work_order.{wo.status}",
                title=f"{wo.wo_number}: {wo.title}",
                timestamp=ts, actor_id=wo.assignee_id,
                ref_type="work_order", ref_id=str(wo.id),
                payload={"status": wo.status, "type": wo.type, "priority": wo.priority,
                         "sla_breach": wo.sla_breach}))
        return events


class FailureHistoryProvider:
    source = "failure"

    async def fetch(self, session, tenant_id, equipment_id) -> list[TimelineEvent]:
        failures = await FailureRepository(session, tenant_id).list_for_equipment(equipment_id)
        return [
            TimelineEvent(
                source="failure", type="failure.recorded",
                title=f"Failure: {f.description[:80]}" if f.description else "Failure recorded",
                timestamp=f.occurred_at, ref_type="failure_record", ref_id=str(f.id),
                payload={"severity": f.severity, "downtime_minutes": f.downtime_minutes,
                         "rca_status": f.rca_status})
            for f in failures
        ]


class MaintenanceMetricsProvider:
    async def fetch(self, session, tenant_id, equipment_id) -> dict:
        return await MetricsRepository(session, tenant_id).compute(equipment_id=equipment_id)


class WorkOrderSearchProvider:
    """Emits the same result shape the search router returns to the frontend
    ({id,title,type,snippet,source,relevance,matchType,plant,date,status,link})."""

    result_type = "Work Orders"
    suggest_category = "Work Orders"
    suggest_key = "WorkOrders"

    def _match(self, session, tenant_id, query: str, limit: int):
        like = f"%{query}%"
        return (
            select(WorkOrder)
            .where(WorkOrder.tenant_id == tenant_id, WorkOrder.deleted_at.is_(None),
                   or_(WorkOrder.title.ilike(like), WorkOrder.wo_number.ilike(like),
                       WorkOrder.closure_notes.ilike(like)))
            .order_by(WorkOrder.created_at.desc())
            .limit(limit)
        )

    async def search(self, session: AsyncSession, tenant_id: uuid.UUID | str,
                     query: str, limit: int) -> list[dict]:
        from app.modules.knowledge.search_service import _highlight

        rows = list((await session.execute(self._match(session, tenant_id, query, limit))).scalars())
        return [
            {"id": str(wo.id), "title": f"{wo.wo_number}: {wo.title}", "type": "Work Orders",
             "snippet": _highlight(f"{wo.title}. {wo.closure_notes or ''}".strip(), query),
             "source": "Maintenance", "relevance": 80, "matchType": "keyword",
             "plant": "", "date": wo.created_at.date().isoformat(),
             "status": wo.status, "link": f"#work-orders/{wo.id}"}
            for wo in rows
        ]

    async def suggest(self, session: AsyncSession, tenant_id: uuid.UUID | str,
                      q: str, limit: int) -> list[dict]:
        rows = list((await session.execute(self._match(session, tenant_id, q, limit))).scalars())
        return [
            {"id": str(wo.id), "name": f"{wo.wo_number}: {wo.title}", "category": "Work Orders",
             "desc": wo.status, "route": f"#work-orders/{wo.id}"}
            for wo in rows
        ]


def register() -> None:
    """Idempotent registration into the cross-module registries."""
    history_registry.register(WorkOrderHistoryProvider())
    history_registry.register(FailureHistoryProvider())
    metrics_registry.register(MaintenanceMetricsProvider())
    federated_registry.register(WorkOrderSearchProvider())


register()
