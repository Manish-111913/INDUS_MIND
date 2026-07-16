"""Auth FastAPI dependencies (docs/02 §6).

`get_current_user` verifies the JWT + token_version + session liveness;
`get_tenant_context` exposes the active tenant; `require(permission)` enforces a
`resource.action` against the Redis-cached effective permission set (deny by
default until the users module populates it). These live in the auth module so
core stays free of module imports; routers import from here.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field

import jwt
from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.exceptions import PermissionDenied, TokenExpired, Unauthenticated
from app.core.logging import tenant_id_ctx, user_id_ctx
from app.core.security import decode_jwt
from app.modules.auth import permissions
from app.modules.auth.repository import SessionRepository, UserRepository

API_KEY_HEADER = "X-API-Key"


@dataclass(slots=True)
class CurrentUser:
    id: uuid.UUID
    tenant_id: uuid.UUID
    roles: list[str] = field(default_factory=list)
    perm_hash: str = ""
    session_id: uuid.UUID | None = None
    token_version: int = 0
    perms: frozenset[str] = frozenset()
    # Set when the caller authenticated with an API key rather than a JWT
    # (docs/05 S8). `id` then carries the key's creator, so audit still names a
    # human, while this says which machine credential acted.
    api_key_id: uuid.UUID | None = None

    @property
    def is_api_key(self) -> bool:
        return self.api_key_id is not None


def _bearer(request: Request) -> str:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise Unauthenticated("Missing bearer token", code="UNAUTHENTICATED")
    return token


async def _api_key_principal(session: AsyncSession, presented: str) -> CurrentUser:
    """Authenticate an X-API-Key caller (docs/05 S8).

    The key's `scopes` become the permission set verbatim, so `require(...)`
    gates machine callers through exactly the same path as human ones. There is
    no perm_hash/token_version dance: a key has no session to go stale, and
    revocation is immediate because every request re-reads the row.
    """
    from app.modules.integrations.keys_service import authenticate, touch_last_used

    key = await authenticate(session, presented)
    if key is None:
        raise Unauthenticated("Invalid API key", code="INVALID_API_KEY")
    await touch_last_used(session, key)

    tenant_id_ctx.set(str(key.tenant_id))
    if key.created_by:
        user_id_ctx.set(str(key.created_by))

    return CurrentUser(
        # Attribute actions to the human who minted the key; api_key_id records
        # which credential was used.
        id=key.created_by or key.id,
        tenant_id=key.tenant_id,
        roles=[],
        perms=frozenset(key.scopes or []),
        api_key_id=key.id,
    )


async def get_current_user(
    request: Request, session: AsyncSession = Depends(get_session)
) -> CurrentUser:
    # An API key is an alternative principal; checked first so a machine caller
    # never needs to also present a bearer token.
    presented = request.headers.get(API_KEY_HEADER)
    if presented:
        return await _api_key_principal(session, presented)

    token = _bearer(request)
    try:
        claims = decode_jwt(token)
    except jwt.ExpiredSignatureError as exc:
        raise TokenExpired() from exc
    except jwt.PyJWTError as exc:
        raise Unauthenticated("Invalid token", code="UNAUTHENTICATED") from exc

    if claims.get("typ") != "access":
        raise Unauthenticated("Wrong token type", code="UNAUTHENTICATED")

    user = await UserRepository(session).get(claims["sub"])
    if user is None or user.status != "active":
        raise Unauthenticated("Account is not active", code="ACCOUNT_INACTIVE")

    # Global-logout / password-reset invalidation: stale token_version → refresh.
    if int(claims.get("tv", -1)) != user.token_version:
        raise Unauthenticated("Token revoked", code="TOKEN_REVOKED")

    session_id = claims.get("sid")
    if session_id:
        sess = await SessionRepository(session).get(session_id)
        if sess is None or not sess.is_active:
            raise Unauthenticated("Session revoked", code="SESSION_REVOKED")

    # Resolve effective permissions (cache-or-compute) and enforce perm_hash
    # freshness: if the role graph changed, the token's hash no longer matches
    # and the client must refresh to pick up the new permission set (docs/02 §6).
    perms = await permissions.get_effective_permissions(user.tenant_id, user.id, session=session)
    if claims.get("perm_hash", "") != permissions.perm_hash(perms):
        raise Unauthenticated("Permissions changed", code="PERM_STALE")

    # Bind identity into log context for the remainder of the request.
    tenant_id_ctx.set(str(user.tenant_id))
    user_id_ctx.set(str(user.id))

    return CurrentUser(
        id=user.id,
        tenant_id=user.tenant_id,
        roles=list(claims.get("roles", [])),
        perm_hash=claims.get("perm_hash", ""),
        session_id=uuid.UUID(session_id) if session_id else None,
        token_version=user.token_version,
        perms=frozenset(perms),
    )


async def get_tenant_context(
    current: CurrentUser = Depends(get_current_user),
) -> uuid.UUID:
    return current.tenant_id


def require(permission: str):
    """Router guard: `Depends(require("wo.close"))`. Deny by default.

    Reads the permission set already resolved by get_current_user (single
    resolution per request); service-layer resource-scope checks layer on top.
    """

    async def _dep(current: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if permission not in current.perms:
            raise PermissionDenied(f"Missing permission: {permission}")
        return current

    return _dep
