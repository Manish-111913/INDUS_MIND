"""Lessons module events (docs/02 §10, §34).

Graph projection: on publish, MERGE the Lesson node and its
`Lesson -[:DERIVED_FROM]-> FailureEvent` evidence edges (best-effort; graph is
optional). Triggers: `rca.published` and `ncr.created` enqueue a full pattern
check; `failure.recorded` triggers one only once an asset crosses a repeat
threshold. Each handler runs in its own session so it never blocks the emitter.
Importing this module registers the subscribers.
"""

from __future__ import annotations

from app.core import graph
from app.core.events import Event, EventType, bus
from app.core.logging import get_logger

log = get_logger("lessons.events")

_REPEAT_THRESHOLD = 3


async def project_lesson(tenant_id, lesson) -> None:
    """MERGE the Lesson node + DERIVED_FROM edges to its cited failure events."""
    try:
        await graph.init_schema()
        await graph.run_write(
            "MERGE (l:Lesson {pg_id:$pid}) SET l.tenant_id=$tenant, l.title=$title",
            {"pid": str(lesson.id), "tenant": str(tenant_id), "title": lesson.title})
        failure_ids = [e.get("id") for e in (lesson.evidence or []) if e.get("type") == "failure"]
        for fid in failure_ids:
            await graph.run_write(
                "MATCH (l:Lesson {pg_id:$pid}) "
                "MERGE (f:FailureEvent {pg_id:$fid}) SET f.tenant_id=$tenant "
                "MERGE (l)-[:DERIVED_FROM]->(f)",
                {"pid": str(lesson.id), "fid": fid, "tenant": str(tenant_id)})
    except Exception as exc:  # noqa: BLE001 — graph is optional; never fail the publish
        log.warning("graph_lesson_project_failed", lesson_id=str(lesson.id), error=str(exc))


async def _detect(tenant_id, scope: dict) -> None:
    from app.core.database import SessionFactory
    from app.modules.lessons.agent import LessonsAgent

    try:
        async with SessionFactory() as session:
            await LessonsAgent(session, tenant_id).detect(scope=scope)
            await session.commit()
    except Exception as exc:  # noqa: BLE001 — pattern detection is best-effort
        log.warning("lessons_trigger_failed", error=str(exc))


async def _on_rca_or_ncr(event: Event) -> None:
    if event.tenant_id:
        await _detect(event.tenant_id, {})


async def _on_failure(event: Event) -> None:
    payload = event.payload or {}
    equipment_id = payload.get("equipment_id")
    if not (event.tenant_id and equipment_id):
        return
    from app.core.database import SessionFactory
    from app.modules.maintenance.repository import FailureRepository

    async with SessionFactory() as session:
        failures = await FailureRepository(session, event.tenant_id).list_for_equipment(equipment_id)
    if len(failures) >= _REPEAT_THRESHOLD:
        await _detect(event.tenant_id, {})


bus.subscribe(EventType.RCA_PUBLISHED, _on_rca_or_ncr)
bus.subscribe(EventType.NCR_CREATED, _on_rca_or_ncr)
bus.subscribe(EventType.FAILURE_RECORDED, _on_failure)
