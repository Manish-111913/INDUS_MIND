"""API key generation, authentication and CRUD (docs/05 S8).

Keys look like `imk_live_<43 url-safe chars>` (32 random bytes). Only the SHA-256
is stored, so a leaked database yields no usable credential and the plaintext is
returned exactly once, at creation.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFound
from app.core.logging import get_logger
from app.core.redis import get_redis
from app.modules.integrations.models import ApiKey

log = get_logger("integrations.keys")

KEY_PREFIX = "imk_live_"
_KEY_BYTES = 32
# How much of the key is stored in the clear for display. Enough to
# disambiguate two keys in a list, far too little to brute-force the rest.
_PREFIX_DISPLAY_CHARS = 16
# `last_used_at` is telemetry, not an audit record — writing it on every request
# would put a DB write in the hot path of every API-key call. One write per key
# per this window is plenty to answer "is this key still in use?".
LAST_USED_THROTTLE_S = 60


def generate_key() -> tuple[str, str, str]:
    """→ (plaintext, key_prefix, key_hash). The plaintext is never persisted."""
    plaintext = f"{KEY_PREFIX}{secrets.token_urlsafe(_KEY_BYTES)}"
    return plaintext, plaintext[:_PREFIX_DISPLAY_CHARS], hash_key(plaintext)


def hash_key(plaintext: str) -> str:
    return hashlib.sha256(plaintext.encode()).hexdigest()


async def authenticate(session: AsyncSession, plaintext: str) -> ApiKey | None:
    """Resolve a presented key, or None if unknown/inactive/expired.

    Looks up by hash, never by prefix: the prefix is not a secret and two keys
    could share one.
    """
    if not plaintext.startswith(KEY_PREFIX):
        return None
    row = (await session.execute(
        select(ApiKey).where(ApiKey.key_hash == hash_key(plaintext))
    )).scalar_one_or_none()
    if row is None or not row.is_active:
        return None
    if row.expires_at is not None and row.expires_at <= datetime.now(UTC):
        return None
    return row


async def touch_last_used(session: AsyncSession, key: ApiKey) -> None:
    """Best-effort, Redis-throttled `last_used_at` update (see the constant above).

    Never raises: this is telemetry, and a Redis blip must not fail an otherwise
    valid API call.
    """
    try:
        redis = get_redis()
        # SET NX EX: the first caller in the window wins and does the write.
        if not await redis.set(f"apikey:touched:{key.id}", "1",
                               ex=LAST_USED_THROTTLE_S, nx=True):
            return
        key.last_used_at = datetime.now(UTC)
        await session.flush()
    except Exception as exc:  # noqa: BLE001
        log.warning("api_key_touch_failed", key_id=str(key.id), error=str(exc))


class ApiKeyService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    async def list(self) -> list[ApiKey]:
        stmt = (select(ApiKey).where(ApiKey.tenant_id == self.tenant_id)
                .order_by(ApiKey.created_at.desc()))
        return list((await self.session.execute(stmt)).scalars().all())

    async def get(self, key_id: uuid.UUID) -> ApiKey:
        row = (await self.session.execute(
            select(ApiKey).where(ApiKey.id == key_id, ApiKey.tenant_id == self.tenant_id)
        )).scalar_one_or_none()
        if row is None:
            raise NotFound("API key not found", code="API_KEY_NOT_FOUND")
        return row

    async def create(self, *, name: str, scopes: list[str], expires_at: datetime | None,
                     actor_id: uuid.UUID) -> tuple[ApiKey, str]:
        """→ (row, plaintext). The caller must surface the plaintext once and drop it."""
        plaintext, prefix, key_hash = generate_key()
        row = ApiKey(tenant_id=self.tenant_id, name=name, key_prefix=prefix, key_hash=key_hash,
                     scopes=scopes, expires_at=expires_at, is_active=True,
                     created_by=actor_id, updated_by=actor_id)
        self.session.add(row)
        await self.session.flush()
        return row, plaintext

    async def revoke(self, key_id: uuid.UUID, actor_id: uuid.UUID) -> ApiKey:
        """Deactivate rather than delete: the audit trail references the key, and a
        revoked key's history should stay readable."""
        row = await self.get(key_id)
        row.is_active = False
        row.updated_by = actor_id
        await self.session.flush()
        return row
