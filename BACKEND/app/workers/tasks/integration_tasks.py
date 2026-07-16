"""Webhook delivery Celery tasks (docs/05 S8).

`deliver_webhook` POSTs one delivery; `sweep_webhook_retries` is the beat task
that picks up rows whose `next_retry_at` has come due.

Retries are driven by the delivery row's own schedule, not Celery's `retry()`:
the backoff is business state an operator can see in the deliveries log, and it
survives a broker flush. Celery is only the executor.
"""

from __future__ import annotations

import asyncio
import uuid

from sqlalchemy import select

from app.core.logging import get_logger

# Register cross-module models so SQLAlchemy resolves relationships in the worker.
from app.modules.auth import models as _auth  # noqa: E402,F401
from app.modules.integrations import models as _integrations  # noqa: E402,F401
from app.modules.tenants import models as _tenants  # noqa: E402,F401
from app.modules.users import models as _users  # noqa: E402,F401
from app.workers.celery_app import celery

log = get_logger("workers.integrations")


async def _deliver(delivery_id: uuid.UUID) -> str:
    from app.core.database import SessionFactory
    from app.modules.integrations.models import WebhookDelivery
    from app.modules.integrations.webhooks_service import WebhookService

    async with SessionFactory() as session:
        row = (await session.execute(
            select(WebhookDelivery).where(WebhookDelivery.id == delivery_id)
        )).scalar_one_or_none()
        if row is None:
            log.warning("webhook_delivery_missing", delivery_id=str(delivery_id))
            return "missing"
        if row.status in ("delivered", "failed"):
            return row.status  # terminal — a duplicate dispatch must not re-send
        row.status = "delivering"
        await session.flush()
        result = await WebhookService(session, row.tenant_id).attempt(row)
        await session.commit()
        return result.status


@celery.task(name="app.workers.tasks.integration_tasks.deliver_webhook")
def deliver_webhook(delivery_id: str) -> str:
    return asyncio.run(_deliver(uuid.UUID(delivery_id)))


async def _sweep() -> int:
    """Re-dispatch every delivery whose backoff has elapsed."""
    from datetime import UTC, datetime

    from app.core.database import SessionFactory
    from app.modules.integrations.models import WebhookDelivery

    async with SessionFactory() as session:
        rows = (await session.execute(
            select(WebhookDelivery.id).where(
                WebhookDelivery.status == "retrying",
                WebhookDelivery.next_retry_at.isnot(None),
                WebhookDelivery.next_retry_at <= datetime.now(UTC),
            ).limit(500)
        )).scalars().all()
    for delivery_id in rows:
        await _deliver(delivery_id)
    if rows:
        log.info("webhook_retry_sweep", count=len(rows))
    return len(rows)


@celery.task(name="app.workers.tasks.integration_tasks.sweep_webhook_retries")
def sweep_webhook_retries() -> int:
    return asyncio.run(_sweep())
