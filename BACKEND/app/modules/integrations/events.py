"""Webhook event subscriber (docs/05 S8).

Subscribes to every domain event and fans matching ones out to the tenant's
webhook endpoints. Importing this module registers the subscriber.

Subscribing to *all* event types is deliberate: which events matter is an
endpoint's `event_codes` — tenant data — so a hardcoded subset here would silently
cap what an integration can ever listen to.

Enqueue and deliver are split: the handler only writes `webhook_deliveries` rows
(fast, in its own session) and hands the actual HTTP POST to Celery. A subscriber
that is slow or down must never hold up the business transaction that emitted the
event.
"""

from __future__ import annotations

from app.core.events import Event, EventType, bus
from app.core.logging import get_logger

log = get_logger("integrations.events")


async def _fan_out(event: Event) -> None:
    if not event.tenant_id:
        return  # system-scoped events have no tenant to route to
    from app.core.database import SessionFactory
    from app.modules.integrations.webhooks_service import WebhookService

    try:
        async with SessionFactory() as session:
            svc = WebhookService(session, event.tenant_id)
            deliveries = await svc.enqueue_for_event(str(event.type), {
                "event": str(event.type),
                "tenant_id": event.tenant_id,
                "actor_id": event.actor_id,
                "data": event.payload,
            })
            await session.commit()
        for delivery in deliveries:
            _dispatch(str(delivery.id))
    except Exception as exc:  # noqa: BLE001 — never break the emitting transaction
        log.error("webhook_fanout_failed", event_type=str(event.type), error=str(exc))


def _dispatch(delivery_id: str) -> None:
    """Hand the POST to Celery; fall back to logging if the broker is down."""
    try:
        from app.workers.tasks.integration_tasks import deliver_webhook

        deliver_webhook.delay(delivery_id)
    except Exception as exc:  # noqa: BLE001
        # The row is already persisted as pending, so the retry sweeper will pick
        # it up — losing the immediate dispatch only delays it.
        log.warning("webhook_dispatch_deferred", delivery_id=delivery_id, error=str(exc))


for _event_type in EventType:
    bus.subscribe(_event_type, _fan_out)
