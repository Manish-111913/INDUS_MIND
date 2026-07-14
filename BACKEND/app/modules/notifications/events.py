"""Notification event subscribers (docs/02 §34).

The single routing subscriber consumes the domain events that map to user-facing
notifications and delegates to `NotificationRouter` (DB routing rules → audience →
channels). Each handler runs in its own DB session/transaction so a slow or
failing notification never blocks or rolls back the originating business
transaction. Importing this module registers the subscribers.

`gap.detected` is intentionally NOT subscribed here — the compliance module emits
a `notification.created` for gaps, which the generic handler routes; subscribing
to both would double-notify.
"""

from __future__ import annotations

from app.core.events import Event, EventType, bus
from app.core.logging import get_logger

log = get_logger("notifications.events")

# Domain events routed to notifications (each resolved against notification_rules).
_ROUTED = (
    EventType.NOTIFICATION_CREATED,
    EventType.WORKORDER_ASSIGNED,
    EventType.WORKORDER_CREATED,
    EventType.PREDICTION_CREATED,
    EventType.LESSON_PUBLISHED,
    EventType.RCA_PUBLISHED,
    EventType.DOCUMENT_INGESTED,
)


async def _route(event: Event) -> None:
    if not event.tenant_id:
        return
    from app.core.database import SessionFactory
    from app.modules.notifications.service import NotificationRouter

    try:
        async with SessionFactory() as session:
            await NotificationRouter(session, event.tenant_id).route(
                str(event.type), payload=event.payload or {}, actor_id=event.actor_id)
            await session.commit()
    except Exception as exc:  # noqa: BLE001 — notifications must never break the emitter
        log.warning("notification_route_failed", event_type=str(event.type), error=str(exc))


for _event_type in _ROUTED:
    bus.subscribe(_event_type, _route)
