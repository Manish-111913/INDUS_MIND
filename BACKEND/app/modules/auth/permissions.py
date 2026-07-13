"""Effective-permission resolution + Redis cache (docs/02 §6, §31).

RBAC/PBAC: a user's effective permission set (`resource.action` codes) is
computed by the `users` module and cached in Redis with TTL ∞, invalidated on
change. Its hash is embedded in the JWT (`perm_hash`) so a stale token forces a
refresh. This module owns the cache contract; `users` will populate it. Until
then the resolver returns an empty set (deny-by-default) — wiring, not policy.
"""

from __future__ import annotations

import hashlib
import json
import uuid

from app.core.redis import get_redis


def _cache_key(tenant_id: uuid.UUID | str, user_id: uuid.UUID | str) -> str:
    return f"tenant:{tenant_id}:perms:{user_id}"


def perm_hash(perms: set[str]) -> str:
    """Stable short hash of a permission set — embedded in the access token."""
    joined = ",".join(sorted(perms))
    return hashlib.sha256(joined.encode()).hexdigest()[:16]


async def get_effective_permissions(
    tenant_id: uuid.UUID | str, user_id: uuid.UUID | str
) -> set[str]:
    raw = await get_redis().get(_cache_key(tenant_id, user_id))
    if not raw:
        return set()
    try:
        return set(json.loads(raw))
    except (ValueError, TypeError):
        return set()


async def set_effective_permissions(
    tenant_id: uuid.UUID | str, user_id: uuid.UUID | str, perms: set[str]
) -> None:
    """Populated by the users module on role/permission change (TTL ∞)."""
    await get_redis().set(_cache_key(tenant_id, user_id), json.dumps(sorted(perms)))


async def invalidate_permissions(tenant_id: uuid.UUID | str, user_id: uuid.UUID | str) -> None:
    await get_redis().delete(_cache_key(tenant_id, user_id))
