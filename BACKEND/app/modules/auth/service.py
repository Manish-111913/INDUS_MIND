"""Auth service — login, refresh rotation + reuse detection, sessions, reset, MFA.

docs/02 §6, §24. No business logic in routers; the router only maps HTTP ⇄ this
service and handles the refresh cookie. Every auth outcome writes an audit_log
row and publishes a typed event on the internal bus.
"""

from __future__ import annotations

import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

import pyotp
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.email import send_email
from app.core.events import Event, EventType, bus
from app.core.exceptions import AppError, NotFound, Unauthenticated, ValidationFailed
from app.core.logging import get_logger
from app.core.redis import get_redis
from app.core.security import decrypt_secret, encrypt_secret, hash_password, verify_password
from app.modules.audit.service import AuditService
from app.modules.auth import permissions
from app.modules.auth.models import RefreshToken, Session, User
from app.modules.auth.repository import (
    RefreshTokenRepository,
    SessionRepository,
    UserRepository,
)
from app.modules.auth.tokens import build_access_token, build_refresh_token

log = get_logger("auth.service")

LOGIN_MAX_FAILS = 5
LOGIN_LOCK_TTL = 15 * 60  # 15 minutes (docs/02 §6)
RESET_TTL = 60 * 60  # 1 hour
MFA_SETUP_TTL = 10 * 60


class AccountLocked(AppError):
    code, http_status, message = "ACCOUNT_LOCKED", 429, "Too many failed logins; try later"


@dataclass(slots=True)
class RequestMeta:
    ip: str | None = None
    ua: str | None = None
    device: str | None = None


@dataclass(slots=True)
class AccessBundle:
    access_token: str
    expires_in: int


@dataclass(slots=True)
class LoginResult:
    access: AccessBundle
    refresh_raw: str
    user: User


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.users = UserRepository(session)
        self.sessions = SessionRepository(session)
        self.tokens = RefreshTokenRepository(session)
        self.audit = AuditService(session)

    # ── login ────────────────────────────────────────────────────────────────
    async def login(
        self, *, email: str, password: str, mfa_code: str | None, meta: RequestMeta
    ) -> LoginResult:
        await self._assert_not_locked(email)
        user = await self.users.get_by_email(None, email)

        if user is None or user.password_hash is None or not verify_password(
            password, user.password_hash
        ):
            await self._record_failure(email, user, meta, reason="invalid_credentials")
            raise Unauthenticated("Invalid email or password", code="INVALID_CREDENTIALS")

        if user.status != "active":
            await self._record_failure(email, user, meta, reason="inactive")
            raise Unauthenticated("Account is not active", code="ACCOUNT_INACTIVE")

        if user.mfa_enabled:
            if not mfa_code:
                raise Unauthenticated("MFA code required", code="MFA_REQUIRED")
            secret = decrypt_secret(user.mfa_secret or "")
            if not pyotp.TOTP(secret).verify(mfa_code, valid_window=1):
                await self._record_failure(email, user, meta, reason="bad_mfa")
                raise Unauthenticated("Invalid MFA code", code="MFA_INVALID")

        await self._clear_failures(email)
        result = await self._establish_session(user, meta)

        user.last_login_at = datetime.now(UTC)
        await self.audit.write(
            action="auth.login", entity_type="user", entity_id=user.id,
            tenant_id=user.tenant_id, actor_id=user.id, actor_ip=meta.ip,
        )
        await bus.publish(Event(EventType.USER_LOGGED_IN, tenant_id=str(user.tenant_id),
                                actor_id=str(user.id)))
        return result

    async def _establish_session(self, user: User, meta: RequestMeta) -> LoginResult:
        session = await self.sessions.add(
            Session(tenant_id=user.tenant_id, user_id=user.id, device=meta.device,
                    ip=meta.ip, ua=meta.ua, last_seen_at=datetime.now(UTC))
        )
        family_id = uuid.uuid4()
        refresh = await self._issue_refresh(user, session, family_id, meta)
        access = await self._issue_access(user, session.id)
        return LoginResult(access=access, refresh_raw=refresh, user=user)

    # ── refresh (rotation + reuse detection) ─────────────────────────────────
    async def refresh(self, *, refresh_raw: str, meta: RequestMeta) -> tuple[AccessBundle, str]:
        from app.core.security import sha256_hex

        token = await self.tokens.get_by_hash(sha256_hex(refresh_raw))
        if token is None:
            raise Unauthenticated("Invalid refresh token", code="INVALID_REFRESH")

        # Reuse detection: a token already rotated/revoked is being replayed →
        # assume theft, revoke the entire family (docs/02 §6).
        if token.revoked_at is not None:
            await self.tokens.revoke_family(token.family_id)
            if token.session_id:
                await self.sessions.revoke(token.session_id)
            await self.audit.write(
                action="auth.refresh_reuse", entity_type="refresh_token",
                entity_id=token.id, tenant_id=token.tenant_id, actor_id=token.user_id,
                actor_ip=meta.ip,
            )
            await bus.publish(Event(EventType.REFRESH_REUSE_DETECTED,
                                    tenant_id=str(token.tenant_id), actor_id=str(token.user_id)))
            # Persist the family revocation before signalling the error —
            # otherwise get_session rolls it back and the theft defence is lost.
            await self.session.commit()
            raise Unauthenticated("Refresh token reuse detected", code="TOKEN_REUSE")

        if token.expires_at <= datetime.now(UTC):
            raise Unauthenticated("Refresh token expired", code="TOKEN_EXPIRED")

        user = await self.users.get(token.user_id)
        if user is None or user.status != "active":
            raise Unauthenticated("Account is not active", code="ACCOUNT_INACTIVE")

        # Rotate: mark the presented token used, mint a fresh one in the family.
        await self.tokens.revoke_one(token.id)
        session = await self.sessions.get(token.session_id) if token.session_id else None
        if session is None or not session.is_active:
            raise Unauthenticated("Session revoked", code="SESSION_REVOKED")
        await self.sessions.touch(session.id)
        new_raw = await self._issue_refresh(user, session, token.family_id, meta)
        await self.audit.write(
            action="auth.refresh", entity_type="user", entity_id=user.id,
            tenant_id=user.tenant_id, actor_id=user.id, actor_ip=meta.ip,
        )
        access = await self._issue_access(user, session.id)
        return access, new_raw

    # ── OAuth SSO (account link by verified email) ───────────────────────────
    async def oauth_login(self, *, userinfo: dict, provider: str, meta: RequestMeta) -> LoginResult:
        email = userinfo.get("email")
        verified = userinfo.get("email_verified", False)
        if not email or not verified:
            raise Unauthenticated("Unverified SSO email", code="OAUTH_EMAIL_UNVERIFIED")
        user = await self.users.get_by_email(None, email)
        if user is None:
            # Auto-provisioning is a users-module concern; require a linked account.
            raise Unauthenticated("No linked account for this email", code="OAUTH_NO_ACCOUNT")
        if user.status != "active":
            raise Unauthenticated("Account is not active", code="ACCOUNT_INACTIVE")

        result = await self._establish_session(user, meta)
        user.last_login_at = datetime.now(UTC)
        await self.audit.write(
            action="auth.oauth_login", entity_type="user", entity_id=user.id,
            tenant_id=user.tenant_id, actor_id=user.id, actor_ip=meta.ip,
            after={"provider": provider},
        )
        await bus.publish(Event(EventType.USER_LOGGED_IN, tenant_id=str(user.tenant_id),
                                actor_id=str(user.id)))
        return result

    # ── logout ───────────────────────────────────────────────────────────────
    async def logout(self, *, refresh_raw: str | None, session_id: uuid.UUID | str | None,
                     user_id: uuid.UUID | str | None, tenant_id: uuid.UUID | str | None,
                     meta: RequestMeta) -> None:
        from app.core.security import sha256_hex

        if refresh_raw:
            token = await self.tokens.get_by_hash(sha256_hex(refresh_raw))
            if token is not None:
                await self.tokens.revoke_family(token.family_id)
                if token.session_id:
                    await self.sessions.revoke(token.session_id)
        elif session_id:
            await self.tokens.revoke_by_session(session_id)
            await self.sessions.revoke(session_id)
        await self.audit.write(
            action="auth.logout", entity_type="session", entity_id=session_id,
            tenant_id=tenant_id, actor_id=user_id, actor_ip=meta.ip,
        )
        if user_id and tenant_id:
            await bus.publish(Event(EventType.USER_LOGGED_OUT, tenant_id=str(tenant_id),
                                    actor_id=str(user_id)))

    # ── sessions ─────────────────────────────────────────────────────────────
    async def list_sessions(
        self, *, user_id: uuid.UUID | str, current_session_id: uuid.UUID | str | None
    ) -> list[tuple[Session, bool]]:
        rows = await self.sessions.list_active_for_user(user_id)
        return [(s, str(s.id) == str(current_session_id)) for s in rows]

    async def revoke_session(
        self, *, user_id: uuid.UUID | str, tenant_id: uuid.UUID | str, session_id: uuid.UUID | str,
        meta: RequestMeta,
    ) -> None:
        session = await self.sessions.get(session_id)
        if session is None or str(session.user_id) != str(user_id):
            raise NotFound("Session not found", code="SESSION_NOT_FOUND")
        await self.tokens.revoke_by_session(session_id)
        await self.sessions.revoke(session_id)
        await self.audit.write(
            action="auth.session_revoke", entity_type="session", entity_id=session_id,
            tenant_id=tenant_id, actor_id=user_id, actor_ip=meta.ip,
        )

    # ── password reset ───────────────────────────────────────────────────────
    async def forgot_password(self, *, email: str, meta: RequestMeta) -> None:
        user = await self.users.get_by_email(None, email)
        if user is not None:
            token = secrets.token_urlsafe(32)
            await get_redis().set(f"auth:reset:{token}", str(user.id), ex=RESET_TTL)
            link = f"{settings.frontend_url}/reset-password?token={token}"
            await send_email(
                user.email, "Reset your IndusMind password",
                f"Use this link within 1 hour to reset your password:\n{link}\n",
            )
            await self.audit.write(
                action="auth.password_reset_requested", entity_type="user",
                entity_id=user.id, tenant_id=user.tenant_id, actor_id=user.id, actor_ip=meta.ip,
            )
            await bus.publish(Event(EventType.PASSWORD_RESET_REQUESTED,
                                    tenant_id=str(user.tenant_id), actor_id=str(user.id)))
        # Always succeed silently — never reveal whether the email exists.

    async def reset_password(self, *, token: str, new_password: str, meta: RequestMeta) -> None:
        redis = get_redis()
        user_id = await redis.get(f"auth:reset:{token}")
        if not user_id:
            raise ValidationFailed("Invalid or expired reset token", code="INVALID_RESET_TOKEN")
        user = await self.users.get(user_id)
        if user is None:
            raise ValidationFailed("Invalid or expired reset token", code="INVALID_RESET_TOKEN")

        user.password_hash = hash_password(new_password)
        await self.users.bump_token_version(user.id)  # invalidate live access tokens
        await self.tokens.revoke_all_for_user(user.id)  # kill all refresh families
        await self.sessions.revoke_all_for_user(user.id)
        await redis.delete(f"auth:reset:{token}")
        await self.audit.write(
            action="auth.password_reset_completed", entity_type="user", entity_id=user.id,
            tenant_id=user.tenant_id, actor_id=user.id, actor_ip=meta.ip,
        )
        await bus.publish(Event(EventType.PASSWORD_RESET_COMPLETED,
                                tenant_id=str(user.tenant_id), actor_id=str(user.id)))

    # ── MFA (TOTP) ───────────────────────────────────────────────────────────
    async def mfa_setup(self, *, user: User) -> tuple[str, str]:
        secret = pyotp.random_base32()
        await get_redis().set(f"auth:mfa:setup:{user.id}", secret, ex=MFA_SETUP_TTL)
        uri = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name="IndusMind")
        return secret, uri

    async def mfa_verify(self, *, user: User, code: str, meta: RequestMeta) -> None:
        secret = await get_redis().get(f"auth:mfa:setup:{user.id}")
        if not secret:
            raise ValidationFailed("MFA setup not started or expired", code="MFA_SETUP_EXPIRED")
        if not pyotp.TOTP(secret).verify(code, valid_window=1):
            raise ValidationFailed("Invalid MFA code", code="MFA_INVALID")
        user.mfa_secret = encrypt_secret(secret)
        await get_redis().delete(f"auth:mfa:setup:{user.id}")
        await self.audit.write(
            action="auth.mfa_enabled", entity_type="user", entity_id=user.id,
            tenant_id=user.tenant_id, actor_id=user.id, actor_ip=meta.ip,
        )
        await bus.publish(Event(EventType.MFA_ENABLED, tenant_id=str(user.tenant_id),
                                actor_id=str(user.id)))

    # ── internals ────────────────────────────────────────────────────────────
    async def _issue_access(self, user: User, session_id: uuid.UUID | str) -> AccessBundle:
        perms = await permissions.get_effective_permissions(user.tenant_id, user.id)
        issued = build_access_token(
            user_id=user.id, tenant_id=user.tenant_id, roles=[],
            perm_hash=permissions.perm_hash(perms), token_version=user.token_version,
            session_id=session_id,
        )
        return AccessBundle(access_token=issued.token, expires_in=issued.expires_in)

    async def _issue_refresh(
        self, user: User, session: Session, family_id: uuid.UUID, meta: RequestMeta
    ) -> str:
        issued = build_refresh_token()
        await self.tokens.add(
            RefreshToken(
                tenant_id=user.tenant_id, user_id=user.id, session_id=session.id,
                token_hash=issued.token_hash, family_id=family_id,
                expires_at=issued.expires_at, device=meta.device, ip=meta.ip,
            )
        )
        return issued.raw

    async def _assert_not_locked(self, email: str) -> None:
        count = await get_redis().get(f"auth:loginfail:{email.lower()}")
        if count is not None and int(count) >= LOGIN_MAX_FAILS:
            raise AccountLocked()

    async def _record_failure(
        self, email: str, user: User | None, meta: RequestMeta, *, reason: str
    ) -> None:
        redis = get_redis()
        key = f"auth:loginfail:{email.lower()}"
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, LOGIN_LOCK_TTL)
        await self.audit.write(
            action="auth.login_failed", entity_type="user",
            entity_id=user.id if user else None,
            tenant_id=user.tenant_id if user else None,
            actor_id=user.id if user else None, actor_ip=meta.ip,
            after={"reason": reason, "fail_count": count},
        )
        await bus.publish(Event(
            EventType.USER_LOGIN_FAILED,
            tenant_id=str(user.tenant_id) if user else None,
            actor_id=str(user.id) if user else None,
            payload={"reason": reason, "email": email},
        ))
        # Persist the failure audit row before the caller raises (which would
        # otherwise roll it back). The Redis lockout counter is already durable.
        await self.session.commit()

    async def _clear_failures(self, email: str) -> None:
        await get_redis().delete(f"auth:loginfail:{email.lower()}")
