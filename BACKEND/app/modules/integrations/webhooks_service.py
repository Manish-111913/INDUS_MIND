"""Webhook endpoints + delivery (docs/05 S8).

Domain events matching an endpoint's `event_codes` are enqueued as
`webhook_deliveries` rows and POSTed with an HMAC-SHA256 signature. Failures back
off on a fixed schedule and dead-letter to `failed`.

The delivery row is the queue: an attempt is durable state, not an in-memory
retry, so a worker restart cannot lose a pending delivery and an operator can see
exactly why something never arrived.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFound
from app.core.logging import get_logger
from app.modules.integrations.models import WebhookDelivery, WebhookEndpoint

log = get_logger("integrations.webhooks")

SIGNATURE_HEADER = "X-IndusMind-Signature"
EVENT_HEADER = "X-IndusMind-Event"
DELIVERY_HEADER = "X-IndusMind-Delivery"
TIMEOUT_S = 10.0

# Patchable seam for tests. Deliberately an indirection rather than reaching for
# `httpx.AsyncClient` inline: patching that attribute would mutate the shared
# httpx module for the whole process — including the test client and every other
# outbound call — instead of just this module's requests.
http_client_factory = httpx.AsyncClient

# Backoff between attempts. Attempt N fails → wait RETRY_SCHEDULE[N-1] → retry.
# Five entries, so a delivery is retried 5 times over ~13h before dead-lettering:
# long enough to ride out a subscriber's deploy or brief outage, short enough that
# the event is still useful when it lands.
RETRY_SCHEDULE: tuple[timedelta, ...] = (
    timedelta(minutes=1),
    timedelta(minutes=5),
    timedelta(minutes=25),
    timedelta(hours=2),
    timedelta(hours=12),
)
MAX_ATTEMPTS = len(RETRY_SCHEDULE) + 1  # the first try plus one per backoff step


def generate_secret() -> str:
    return secrets.token_urlsafe(32)


def sign(secret: str, body: bytes) -> str:
    """HMAC-SHA256 of the exact bytes on the wire.

    Signing the serialized body (not the dict) is the point: the subscriber
    verifies against the bytes it received, so any re-serialization on our side
    would break the signature.
    """
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def serialize(payload: dict) -> bytes:
    """One canonical encoding, used for both signing and sending."""
    return json.dumps(payload, default=str, separators=(",", ":"), sort_keys=True).encode()


def next_retry_at(attempts: int, *, now: datetime | None = None) -> datetime | None:
    """When to try again after `attempts` failures — None once exhausted."""
    now = now or datetime.now(UTC)
    if attempts < 1 or attempts > len(RETRY_SCHEDULE):
        return None
    return now + RETRY_SCHEDULE[attempts - 1]


class WebhookService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    # ── endpoints ────────────────────────────────────────────────────────────
    async def list_endpoints(self) -> list[WebhookEndpoint]:
        stmt = (select(WebhookEndpoint).where(WebhookEndpoint.tenant_id == self.tenant_id)
                .order_by(WebhookEndpoint.created_at.desc()))
        return list((await self.session.execute(stmt)).scalars().all())

    async def get_endpoint(self, endpoint_id: uuid.UUID) -> WebhookEndpoint:
        row = (await self.session.execute(
            select(WebhookEndpoint).where(WebhookEndpoint.id == endpoint_id,
                                          WebhookEndpoint.tenant_id == self.tenant_id)
        )).scalar_one_or_none()
        if row is None:
            raise NotFound("Webhook endpoint not found", code="WEBHOOK_ENDPOINT_NOT_FOUND")
        return row

    async def create_endpoint(self, *, name: str, url: str, event_codes: list[str],
                              actor_id: uuid.UUID) -> WebhookEndpoint:
        row = WebhookEndpoint(tenant_id=self.tenant_id, name=name, url=url,
                              secret=generate_secret(), event_codes=event_codes,
                              is_active=True, created_by=actor_id, updated_by=actor_id)
        self.session.add(row)
        await self.session.flush()
        return row

    async def update_endpoint(self, endpoint_id: uuid.UUID, patch: dict,
                              actor_id: uuid.UUID) -> WebhookEndpoint:
        row = await self.get_endpoint(endpoint_id)
        for field, value in patch.items():
            setattr(row, field, value)
        row.updated_by = actor_id
        await self.session.flush()
        return row

    async def delete_endpoint(self, endpoint_id: uuid.UUID) -> None:
        row = await self.get_endpoint(endpoint_id)
        await self.session.delete(row)
        await self.session.flush()

    # ── deliveries ───────────────────────────────────────────────────────────
    async def enqueue(self, endpoint: WebhookEndpoint, event_code: str,
                      payload: dict) -> WebhookDelivery:
        row = WebhookDelivery(tenant_id=self.tenant_id, endpoint_id=endpoint.id,
                              event_code=event_code, payload=payload, status="pending",
                              attempts=0)
        self.session.add(row)
        await self.session.flush()
        return row

    async def enqueue_for_event(self, event_code: str, payload: dict) -> list[WebhookDelivery]:
        """Fan an event out to every active endpoint subscribed to it."""
        stmt = select(WebhookEndpoint).where(
            WebhookEndpoint.tenant_id == self.tenant_id,
            WebhookEndpoint.is_active.is_(True),
            # JSONB containment: event_codes @> '["failure.recorded"]'
            WebhookEndpoint.event_codes.contains([event_code]),
        )
        endpoints = (await self.session.execute(stmt)).scalars().all()
        return [await self.enqueue(e, event_code, payload) for e in endpoints]

    async def list_deliveries(self, *, endpoint_id: uuid.UUID | None = None,
                              status: str | None = None, limit: int = 50) -> list[WebhookDelivery]:
        stmt = select(WebhookDelivery).where(WebhookDelivery.tenant_id == self.tenant_id)
        if endpoint_id:
            stmt = stmt.where(WebhookDelivery.endpoint_id == endpoint_id)
        if status:
            stmt = stmt.where(WebhookDelivery.status == status)
        stmt = stmt.order_by(WebhookDelivery.created_at.desc()).limit(limit)
        return list((await self.session.execute(stmt)).scalars().all())

    async def get_delivery(self, delivery_id: uuid.UUID) -> WebhookDelivery:
        row = (await self.session.execute(
            select(WebhookDelivery).where(WebhookDelivery.id == delivery_id,
                                          WebhookDelivery.tenant_id == self.tenant_id)
        )).scalar_one_or_none()
        if row is None:
            raise NotFound("Webhook delivery not found", code="WEBHOOK_DELIVERY_NOT_FOUND")
        return row

    async def attempt(self, delivery: WebhookDelivery) -> WebhookDelivery:
        """POST once and record the outcome. Never raises on transport failure —
        a dead subscriber is an expected state, recorded on the row."""
        endpoint = await self.get_endpoint(delivery.endpoint_id)
        body = serialize(delivery.payload)
        headers = {
            "Content-Type": "application/json",
            SIGNATURE_HEADER: sign(endpoint.secret, body),
            EVENT_HEADER: delivery.event_code,
            DELIVERY_HEADER: str(delivery.id),
        }
        delivery.attempts += 1
        try:
            async with http_client_factory(timeout=TIMEOUT_S) as http:
                resp = await http.post(endpoint.url, content=body, headers=headers)
            delivery.response_code = resp.status_code
            if 200 <= resp.status_code < 300:
                delivery.status = "delivered"
                delivery.delivered_at = datetime.now(UTC)
                delivery.next_retry_at = None
                delivery.error = None
                await self.session.flush()
                return delivery
            delivery.error = f"HTTP {resp.status_code}: {resp.text[:500]}"
        except Exception as exc:  # noqa: BLE001 — timeouts/DNS/refused are normal
            delivery.response_code = None
            delivery.error = f"{type(exc).__name__}: {exc}"[:500]

        retry_at = next_retry_at(delivery.attempts)
        if retry_at is None:
            delivery.status = "failed"      # dead-letter; operator can retry by hand
            delivery.next_retry_at = None
            log.warning("webhook_delivery_failed", delivery_id=str(delivery.id),
                        endpoint_id=str(endpoint.id), attempts=delivery.attempts)
        else:
            delivery.status = "retrying"
            delivery.next_retry_at = retry_at
        await self.session.flush()
        return delivery

    async def retry(self, delivery_id: uuid.UUID) -> WebhookDelivery:
        """Manual retry from the deliveries log — resets the attempt budget so an
        operator who has fixed the subscriber gets the full schedule again."""
        row = await self.get_delivery(delivery_id)
        row.attempts = 0
        row.status = "pending"
        row.error = None
        row.next_retry_at = None
        await self.session.flush()
        return await self.attempt(row)
