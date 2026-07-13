"""Access + refresh token construction (docs/02 §6).

Access: RS256 JWT, 15 min, claims {sub, tenant_id, roles, perm_hash, jti, tv, sid}.
Refresh: opaque high-entropy string; only its SHA-256 hash is persisted.
"""

from __future__ import annotations

import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.core.config import settings
from app.core.security import encode_jwt, sha256_hex


@dataclass(slots=True)
class IssuedAccess:
    token: str
    jti: str
    expires_in: int


def build_access_token(
    *,
    user_id: uuid.UUID | str,
    tenant_id: uuid.UUID | str,
    roles: list[str],
    perm_hash: str,
    token_version: int,
    session_id: uuid.UUID | str,
) -> IssuedAccess:
    now = datetime.now(UTC)
    jti = uuid.uuid4().hex
    ttl = settings.access_token_ttl
    claims = {
        "sub": str(user_id),
        "tenant_id": str(tenant_id),
        "roles": roles,
        "perm_hash": perm_hash,
        "jti": jti,
        "tv": token_version,
        "sid": str(session_id),
        "typ": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl)).timestamp()),
    }
    return IssuedAccess(token=encode_jwt(claims), jti=jti, expires_in=ttl)


@dataclass(slots=True)
class IssuedRefresh:
    raw: str
    token_hash: str
    expires_at: datetime


def build_refresh_token() -> IssuedRefresh:
    raw = secrets.token_urlsafe(48)
    return IssuedRefresh(
        raw=raw,
        token_hash=sha256_hex(raw),
        expires_at=datetime.now(UTC) + timedelta(seconds=settings.refresh_token_ttl),
    )
