"""Semantic answer cache (docs/02 §31).

Caches copilot answers keyed by scope; on a new query we embed it and replay a
cached answer when cosine similarity ≥ 0.97 within the same scope (24h TTL). The
embedding uses the same adapter as retrieval, so identical queries hit exactly.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import uuid

from app.core.embeddings import get_embedding_provider
from app.core.redis import get_redis

SIMILARITY_THRESHOLD = 0.97
CACHE_TTL = 24 * 60 * 60
MAX_ENTRIES = 50


def _scope_key(tenant_id: uuid.UUID | str, scope: dict | None) -> str:
    digest = hashlib.sha256(json.dumps(scope or {}, sort_keys=True, default=str).encode()).hexdigest()[:16]
    return f"tenant:{tenant_id}:copilot:cache:{digest}"


def _cosine(a: list[float], b: list[float]) -> float:
    # both vectors are unit-normalized by the embedding adapter → dot product
    return sum(x * y for x, y in zip(a, b, strict=False))


async def _embed(query: str) -> list[float]:
    provider = get_embedding_provider()
    return (await asyncio.to_thread(provider.embed, [query]))[0]


async def lookup(tenant_id: uuid.UUID | str, query: str, scope: dict | None) -> dict | None:
    raw = await get_redis().get(_scope_key(tenant_id, scope))
    if not raw:
        return None
    entries = json.loads(raw)
    qvec = await _embed(query)
    for entry in entries:
        if _cosine(qvec, entry["embedding"]) >= SIMILARITY_THRESHOLD:
            return entry["payload"]
    return None


async def store(tenant_id: uuid.UUID | str, query: str, scope: dict | None, payload: dict) -> None:
    key = _scope_key(tenant_id, scope)
    redis = get_redis()
    raw = await redis.get(key)
    entries = json.loads(raw) if raw else []
    entries.insert(0, {"embedding": await _embed(query), "payload": payload})
    entries = entries[:MAX_ENTRIES]
    await redis.set(key, json.dumps(entries, default=str), ex=CACHE_TTL)
