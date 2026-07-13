"""Internal event bus — typed events, in-proc pub/sub, Redis Streams bridge stub.

docs/02 §34. Modules publish typed events; subscribers (notifications, graph
updater, cache invalidator, audit writer, lessons trigger) react. Transport is
in-process now with a Redis Streams bridge for cross-process (API ↔ workers) —
the publish API is stable so a later swap to SQS/Kafka is an adapter change.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from app.core.logging import get_logger

log = get_logger("core.events")


class EventType(StrEnum):
    DOCUMENT_INGESTED = "document.ingested"
    ENTITY_EXTRACTED = "entity.extracted"
    WORKORDER_CLOSED = "workorder.closed"
    FAILURE_RECORDED = "failure.recorded"
    GAP_DETECTED = "gap.detected"
    PREDICTION_CREATED = "prediction.created"
    LESSON_PUBLISHED = "lesson.published"
    USER_ROLE_CHANGED = "user.role_changed"
    GRAPH_UPDATED = "graph.updated"
    EQUIPMENT_UPDATED = "equipment.updated"
    # auth / identity
    USER_LOGGED_IN = "user.logged_in"
    USER_LOGIN_FAILED = "user.login_failed"
    USER_LOGGED_OUT = "user.logged_out"
    REFRESH_REUSE_DETECTED = "auth.refresh_reuse_detected"
    PASSWORD_RESET_REQUESTED = "auth.password_reset_requested"
    PASSWORD_RESET_COMPLETED = "auth.password_reset_completed"
    MFA_ENABLED = "auth.mfa_enabled"


@dataclass(slots=True)
class Event:
    type: EventType
    tenant_id: str | None = None
    actor_id: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)


Handler = Callable[[Event], Awaitable[None]]


class EventBus:
    """In-process async pub/sub. Handlers run concurrently, failures isolated."""

    def __init__(self) -> None:
        self._subscribers: dict[EventType, list[Handler]] = defaultdict(list)
        self._bridge: RedisStreamBridge | None = None

    def subscribe(self, event_type: EventType, handler: Handler) -> None:
        self._subscribers[event_type].append(handler)

    def set_bridge(self, bridge: "RedisStreamBridge | None") -> None:
        self._bridge = bridge

    async def publish(self, event: Event) -> None:
        handlers = self._subscribers.get(event.type, [])
        log.info("event_published", event_type=str(event.type), handlers=len(handlers),
                 tenant_id=event.tenant_id)
        results = await asyncio.gather(
            *(self._safe(h, event) for h in handlers), return_exceptions=True
        )
        for r in results:
            if isinstance(r, Exception):
                log.error("event_handler_failed", event_type=str(event.type), error=str(r))
        if self._bridge is not None:
            await self._bridge.forward(event)

    @staticmethod
    async def _safe(handler: Handler, event: Event) -> None:
        await handler(event)


class RedisStreamBridge:
    """Cross-process transport stub — publishes events onto Redis Streams so the
    worker process observes them. Full consumer loop lands with the worker
    wiring; this keeps the seam explicit today (docs/02 §34)."""

    STREAM = "indusmind:events"

    def __init__(self) -> None:
        self._enabled = False  # flipped on once the consumer side is wired

    async def forward(self, event: Event) -> None:
        if not self._enabled:
            return
        from app.core.redis import get_redis

        await get_redis().xadd(
            self.STREAM,
            {"type": str(event.type), "tenant_id": event.tenant_id or "",
             "actor_id": event.actor_id or "", "payload": _json(event.payload)},
            maxlen=10_000,
            approximate=True,
        )


def _json(data: dict[str, Any]) -> str:
    import json

    return json.dumps(data, default=str)


# Process-wide singleton bus.
bus = EventBus()
