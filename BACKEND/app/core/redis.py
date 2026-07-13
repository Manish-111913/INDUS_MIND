"""Redis client (cache / broker / pubsub / rate-limit) — docs/02 §31, §40.

Single lazily-created async client, shared process-wide. Key prefix convention
is `tenant:{id}:…`; helpers here stay tenant-agnostic — callers namespace.
"""

from __future__ import annotations

from redis.asyncio import Redis, from_url

from app.core.config import settings

_client: Redis | None = None


def get_redis() -> Redis:
    global _client
    if _client is None:
        _client = from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
    return _client


async def ping() -> bool:
    return bool(await get_redis().ping())


async def close_redis() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
