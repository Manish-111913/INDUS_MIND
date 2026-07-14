"""Maintenance module events → knowledge-graph projection (docs/02 §9, §34).

Subscribes to `workorder.closed` and `failure.recorded` and MERGEs the
corresponding graph edges via the event bus (Postgres remains source of truth;
the graph is a rebuildable projection):
  · WorkOrder -[:PERFORMED_ON]-> Equipment
  · FailureEvent -[:OCCURRED_ON]-> Equipment  and  FailureEvent -[:HAS_MODE]-> FailureMode
Graph writes are best-effort — a graph outage must never fail a WO close (the
handler swallows and logs). Importing this module registers the subscribers.
"""

from __future__ import annotations

from app.core import graph
from app.core.events import Event, EventType, bus
from app.core.logging import get_logger

log = get_logger("maintenance.events")


async def _project_workorder_closed(event: Event) -> None:
    payload = event.payload or {}
    equipment_id = payload.get("equipment_id")
    wo_id = payload.get("work_order_id")
    if not (event.tenant_id and equipment_id and wo_id):
        return
    try:
        await graph.init_schema()
        await graph.run_write(
            "MERGE (w:WorkOrder {pg_id:$wo}) SET w.tenant_id=$tenant, w.wo_number=$num "
            "WITH w MATCH (e:Equipment {pg_id:$eq}) MERGE (w)-[:PERFORMED_ON]->(e)",
            {"wo": wo_id, "tenant": event.tenant_id, "num": payload.get("wo_number"),
             "eq": equipment_id})
    except Exception as exc:  # noqa: BLE001 — graph is optional; never fail the WO close
        log.warning("graph_workorder_project_failed", work_order_id=wo_id, error=str(exc))


async def _project_failure_recorded(event: Event) -> None:
    payload = event.payload or {}
    failure_id = payload.get("failure_id")
    equipment_id = payload.get("equipment_id")
    mode_id = payload.get("failure_mode_id")
    if not (event.tenant_id and failure_id):
        return
    try:
        await graph.init_schema()
        await graph.run_write(
            "MERGE (f:FailureEvent {pg_id:$fid}) SET f.tenant_id=$tenant",
            {"fid": failure_id, "tenant": event.tenant_id})
        if equipment_id:
            await graph.run_write(
                "MATCH (f:FailureEvent {pg_id:$fid}), (e:Equipment {pg_id:$eq}) "
                "MERGE (f)-[:OCCURRED_ON]->(e)",
                {"fid": failure_id, "eq": equipment_id})
        if mode_id:
            await graph.run_write(
                "MATCH (f:FailureEvent {pg_id:$fid}) "
                "MERGE (m:FailureMode {tenant_id:$tenant, pg_id:$mode}) "
                "MERGE (f)-[:HAS_MODE]->(m)",
                {"fid": failure_id, "tenant": event.tenant_id, "mode": mode_id})
    except Exception as exc:  # noqa: BLE001
        log.warning("graph_failure_project_failed", failure_id=failure_id, error=str(exc))


bus.subscribe(EventType.WORKORDER_CLOSED, _project_workorder_closed)
bus.subscribe(EventType.FAILURE_RECORDED, _project_failure_recorded)
