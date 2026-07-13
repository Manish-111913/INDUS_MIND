"""Equipment module events (docs/02 §31, §34).

Publishes equipment.created/updated/deleted. Subscribes to those events to bust
the Redis-cached equipment tree for the affected tenant (invalidate-on-change,
docs/02 §31). Importing this module registers the subscriber.
"""

from __future__ import annotations

from app.core.events import Event, EventType, bus
from app.core.logging import get_logger
from app.core.redis import get_redis

log = get_logger("equipment.events")

EQUIPMENT_EVENTS = [
    EventType.EQUIPMENT_CREATED,
    EventType.EQUIPMENT_UPDATED,
    EventType.EQUIPMENT_DELETED,
]


async def _invalidate_tree_cache(event: Event) -> None:
    if not event.tenant_id:
        return
    redis = get_redis()
    pattern = f"tenant:{event.tenant_id}:equip:tree:*"
    keys = [key async for key in redis.scan_iter(match=pattern)]
    if keys:
        await redis.delete(*keys)
        log.info("equip_tree_cache_invalidated", tenant_id=event.tenant_id, keys=len(keys))


for _event in EQUIPMENT_EVENTS:
    bus.subscribe(_event, _invalidate_tree_cache)
