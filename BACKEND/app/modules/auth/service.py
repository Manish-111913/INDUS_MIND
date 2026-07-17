"""Auth service — login, refresh rotation + reuse detection, sessions, reset, MFA.

docs/02 §6, §24. No business logic in routers; the router only maps HTTP ⇄ this
service and handles the refresh cookie. Every auth outcome writes an audit_log
row and publishes a typed event on the internal bus.
"""

from __future__ import annotations

import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import pyotp
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.events import Event, EventType, bus
from app.core.exceptions import AppError, ConflictError, NotFound, Unauthenticated, ValidationFailed
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

    # ── self-service registration (docs/02 §24) ─────────────────────────────
    async def register(
        self, *, full_name: str, email: str, password: str, meta: RequestMeta
    ) -> LoginResult:
        """Open sign-up: create an account with any email and log it in.

        Gated by `settings.self_signup_enabled`. New users land in the default
        tenant with the least-privilege role, so a public registrant can sign in
        but sees only what that role permits until an admin grants more.
        """
        if not settings.self_signup_enabled:
            raise ValidationFailed(
                "Self sign-up is disabled. Ask an administrator to invite you.",
                code="SIGNUP_DISABLED", http_status=403)

        # Email is unique across the platform (login resolves it tenant-agnostically).
        if await self.users.get_by_email(None, email) is not None:
            raise ConflictError("Email already in use", code="EMAIL_TAKEN")

        import re
        import uuid
        from app.modules.tenants.service import TenantService

        # Generate a unique slug for the user's workspace
        prefix = email.split("@")[0].lower()
        prefix = re.sub(r"[^a-z0-9]", "", prefix)
        slug = f"{prefix}-{str(uuid.uuid4())[:8]}"
        name = f"{full_name}'s Node"

        tenant = await TenantService(self.session).create_and_initialize_tenant(name=name, slug=slug)

        self._enforce_password_policy(await self._password_policy(tenant.id), password)

        user = await self.users.add(User(
            tenant_id=tenant.id, email=email, full_name=full_name,
            password_hash=hash_password(password), status="active",
        ))

        # Assign the configured least-privilege role (best-effort: if it's missing
        # the account is still created, just with no permissions until granted).
        from app.modules.users.repository import RoleRepository, UserRoleRepository
        from app.modules.users.service import refresh_user_permissions

        role = await RoleRepository(self.session, tenant.id).get_by_name(settings.self_signup_role)
        if role is not None:
            await UserRoleRepository(self.session).set_roles(user.id, [role.id])
        await refresh_user_permissions(self.session, tenant.id, user.id)

        await self.audit.write(
            action="auth.register", entity_type="user", entity_id=user.id,
            tenant_id=tenant.id, actor_id=user.id, actor_ip=meta.ip,
            after={"email": email, "role": settings.self_signup_role if role else None},
        )

        result = await self._establish_session(user, meta)
        user.last_login_at = datetime.now(UTC)
        await bus.publish(Event(EventType.USER_LOGGED_IN, tenant_id=str(tenant.id),
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

    async def revoke_other_sessions(
        self, *, user_id: uuid.UUID | str, tenant_id: uuid.UUID | str,
        keep_session_id: uuid.UUID | str | None, meta: RequestMeta,
    ) -> int:
        """Sign out everywhere except the current session (docs/08 S11)."""
        revoked = 0
        for sess in await self.sessions.list_active_for_user(user_id):
            if keep_session_id and str(sess.id) == str(keep_session_id):
                continue
            await self.tokens.revoke_by_session(sess.id)
            await self.sessions.revoke(sess.id)
            revoked += 1
        await self.audit.write(action="auth.session_revoke_others", entity_type="user",
                               entity_id=user_id, tenant_id=tenant_id, actor_id=user_id,
                               actor_ip=meta.ip, after={"revoked": revoked})
        return revoked

    async def change_password(
        self, *, user_id: uuid.UUID | str, tenant_id: uuid.UUID | str,
        current_password: str, new_password: str, keep_session_id: uuid.UUID | str | None,
        meta: RequestMeta,
    ) -> None:
        """Verify current password, enforce policy, rotate, and sign out other
        sessions (docs/08 S11). Emits auth.password_changed."""
        user = await self.users.get(user_id)
        if user is None or not user.password_hash or not verify_password(
                current_password, user.password_hash):
            raise ValidationFailed("Current password is incorrect",
                                   code="CURRENT_PASSWORD_INVALID", http_status=422)
        self._enforce_password_policy(await self._password_policy(tenant_id), new_password)
        user.password_hash = hash_password(new_password)
        await self.session.flush()
        # Keep the caller's session; kill the rest so a stolen device is locked out.
        await self.revoke_other_sessions(user_id=user_id, tenant_id=tenant_id,
                                         keep_session_id=keep_session_id, meta=meta)
        await self.audit.write(action="auth.password_changed", entity_type="user",
                               entity_id=user_id, tenant_id=tenant_id, actor_id=user_id,
                               actor_ip=meta.ip)
        await bus.publish(Event(EventType.PASSWORD_CHANGED, tenant_id=str(tenant_id),
                                actor_id=str(user_id)))
        # Fire the notification email (best-effort).
        try:
            await self._send_templated(
                user, event_code="auth.password_changed",
                fallback_subject="Your IndusMind password was changed",
                fallback_body="Your password was just changed. If this wasn't you, reset it "
                              "immediately and review your active sessions.",
                context={"full_name": user.full_name})
        except Exception as exc:  # noqa: BLE001
            get_logger("auth").warning("password_changed_email_failed", error=str(exc))

    # ── password reset (docs/08 N1) ──────────────────────────────────────────
    async def forgot_password(self, *, email: str, meta: RequestMeta) -> None:
        """Issue a single-use reset token and email its link.

        Runs in constant-ish time and always returns without signalling whether
        the email exists — user-enumeration defence. The token is stored only as a
        SHA-256 hash; the plaintext lives solely in the emailed link.
        """
        from app.core.security import sha256_hex
        from app.modules.auth.repository import PasswordResetTokenRepository

        user = await self.users.get_by_email(None, email)
        if user is None:
            return  # silent success

        ttl_minutes = await self._reset_ttl_minutes(user.tenant_id)
        raw = secrets.token_urlsafe(32)
        expires_at = datetime.now(UTC) + timedelta(minutes=ttl_minutes)
        reset_repo = PasswordResetTokenRepository(self.session)
        # One live token per user: issuing a new link voids any earlier one.
        await reset_repo.invalidate_user_tokens(user.id)
        await reset_repo.add(user_id=user.id, token_hash=sha256_hex(raw), expires_at=expires_at)

        base_url = await self._app_base_url(user.tenant_id)
        reset_url = f"{base_url}/reset-password?token={raw}"
        await self._send_templated(
            user, event_code="auth.password_reset",
            fallback_subject="Reset your IndusMind password",
            fallback_body=f"Use this link within {ttl_minutes} minutes to reset your "
                          f"password:\n{reset_url}\n",
            context={"reset_url": reset_url, "full_name": user.full_name,
                     "ttl_minutes": ttl_minutes})
        await self.audit.write(
            action="auth.password_reset_requested", entity_type="user",
            entity_id=user.id, tenant_id=user.tenant_id, actor_id=user.id, actor_ip=meta.ip,
        )
        await bus.publish(Event(EventType.PASSWORD_RESET_REQUESTED,
                                tenant_id=str(user.tenant_id), actor_id=str(user.id)))

    async def reset_password(self, *, token: str, new_password: str, meta: RequestMeta) -> None:
        from app.core.security import sha256_hex
        from app.modules.auth.repository import PasswordResetTokenRepository

        reset_repo = PasswordResetTokenRepository(self.session)
        row = await reset_repo.get_by_hash(sha256_hex(token))
        # One rejection path for unknown / expired / already-used, so a caller
        # can't distinguish them by response.
        if row is None or row.used_at is not None or row.expires_at <= datetime.now(UTC):
            raise ValidationFailed("Invalid or expired reset token", code="INVALID_RESET_TOKEN")
        user = await self.users.get(row.user_id)
        if user is None:
            raise ValidationFailed("Invalid or expired reset token", code="INVALID_RESET_TOKEN")

        self._enforce_password_policy(await self._password_policy(user.tenant_id), new_password)
        user.password_hash = hash_password(new_password)
        await reset_repo.mark_used(row.id)              # single-use
        await self.users.bump_token_version(user.id)    # invalidate live access tokens
        await self.tokens.revoke_all_for_user(user.id)  # kill all refresh families
        await self.sessions.revoke_all_for_user(user.id)
        await self.audit.write(
            action="auth.password_reset_completed", entity_type="user", entity_id=user.id,
            tenant_id=user.tenant_id, actor_id=user.id, actor_ip=meta.ip,
        )
        await bus.publish(Event(EventType.PASSWORD_RESET_COMPLETED,
                                tenant_id=str(user.tenant_id), actor_id=str(user.id)))

    # ── reset/password helpers ───────────────────────────────────────────────
    async def _setting(self, tenant_id, key: str, default):
        from app.modules.settings.service import SettingsService

        try:
            return (await SettingsService(self.session, tenant_id).effective(None)).get(key, default)
        except Exception:  # noqa: BLE001 — settings must never block the auth flow
            return default

    async def _reset_ttl_minutes(self, tenant_id) -> int:
        return int(await self._setting(tenant_id, "auth.reset_token_ttl_minutes", 30))

    async def _app_base_url(self, tenant_id) -> str:
        return str(await self._setting(tenant_id, "app.base_url", settings.frontend_url))

    async def _password_policy(self, tenant_id) -> dict:
        default = {"min_length": 10, "require_number": True, "require_symbol": True}
        policy = await self._setting(tenant_id, "auth.password_policy", default)
        return policy if isinstance(policy, dict) else default

    @staticmethod
    def _enforce_password_policy(policy: dict, password: str) -> None:
        """Validate against the tenant policy (docs/08 S11). Same rule the frontend
        strength meter reads, so backend and UI cannot diverge."""
        problems: list[str] = []
        if len(password) < int(policy.get("min_length", 10)):
            problems.append(f"at least {policy.get('min_length', 10)} characters")
        if policy.get("require_number") and not any(c.isdigit() for c in password):
            problems.append("a number")
        if policy.get("require_symbol") and password.isalnum():
            problems.append("a symbol")
        if problems:
            raise ValidationFailed("Password must contain " + ", ".join(problems),
                                   code="PASSWORD_POLICY", http_status=422)

    async def _send_templated(self, user, *, event_code: str, fallback_subject: str,
                              fallback_body: str, context: dict) -> None:
        """Render the notification template for `event_code` if seeded, else use
        the fallback copy. Recipients are email addresses, so this bypasses the
        NotificationRouter (which routes to users) and logs the send directly."""
        from app.modules.notifications import templating
        from app.modules.notifications.repository import TemplateRepository
        from app.modules.notifications.senders import send_email_logged

        tpl = await TemplateRepository(self.session, user.tenant_id).resolve(
            event_code, "email", user.locale or "en")
        subject = templating.render(tpl.subject_tpl, context) if tpl else fallback_subject
        body = templating.render(tpl.body_tpl, context) if tpl else fallback_body
        await send_email_logged(self.session, user.tenant_id, to_email=user.email,
                                subject=subject, body=body,
                                template_id=tpl.id if tpl else None)

    # ── MFA (TOTP) ───────────────────────────────────────────────────────────
    async def mfa_setup(self, *, user: User) -> tuple[str, str]:
        secret = pyotp.random_base32()
        await get_redis().set(f"auth:mfa:setup:{user.id}", secret, ex=MFA_SETUP_TTL)
        uri = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name="IndusMind")
        return secret, uri

    async def mfa_verify(self, *, user: User, code: str, meta: RequestMeta) -> None:
        stored = await get_redis().get(f"auth:mfa:setup:{user.id}")
        if not stored:
            raise ValidationFailed("MFA setup not started or expired", code="MFA_SETUP_EXPIRED")
        secret = str(stored)  # decode_responses=True → str at runtime
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
        # Resolve with the session so the perm_hash reflects the real permission
        # set (and populates the cache) — otherwise get_current_user's freshness
        # check would reject the first request made with this token.
        perms = await permissions.get_effective_permissions(
            user.tenant_id, user.id, session=self.session
        )
        roles = await self._role_names(user)
        issued = build_access_token(
            user_id=user.id, tenant_id=user.tenant_id, roles=roles,
            perm_hash=permissions.perm_hash(perms), token_version=user.token_version,
            session_id=session_id,
        )
        return AccessBundle(access_token=issued.token, expires_in=issued.expires_in)

    async def _role_names(self, user: User) -> list[str]:
        from app.modules.users.repository import UserRoleRepository

        return await UserRoleRepository(self.session).role_names_for_user(user.id, user.tenant_id)

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
