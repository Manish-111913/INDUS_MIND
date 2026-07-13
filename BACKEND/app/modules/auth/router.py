"""Auth HTTP router (docs/02 §24). Maps HTTP ⇄ AuthService; owns the refresh cookie.

The refresh token rides in an httpOnly, SameSite=Strict cookie scoped to the
auth path; `Secure` is set outside local so httpx/browser send it over http in
dev. All logic lives in the service.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.responses import success
from app.core.config import settings
from app.core.database import get_session
from app.modules.auth import oauth
from app.modules.auth.dependencies import CurrentUser, get_current_user
from app.modules.auth.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    MessageResponse,
    MfaSetupResponse,
    MfaVerifyRequest,
    RefreshResponse,
    ResetPasswordRequest,
    SessionRead,
    UserRead,
)
from app.modules.auth.service import AuthService, RequestMeta
from app.modules.auth.repository import UserRepository

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"
COOKIE_PATH = "/api/v1/auth"


def _meta(request: Request) -> RequestMeta:
    return RequestMeta(
        ip=request.client.host if request.client else None,
        ua=request.headers.get("user-agent"),
        device=request.headers.get("x-device-name"),
    )


def _set_refresh_cookie(response: Response, raw: str) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        raw,
        max_age=settings.refresh_token_ttl,
        httponly=True,
        secure=not settings.is_local,
        samesite="strict",
        path=COOKIE_PATH,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH)


# ── login / refresh / logout ─────────────────────────────────────────────────
@router.post("/login", summary="Password login → access token + refresh cookie")
async def login(
    body: LoginRequest, request: Request, response: Response,
    session: AsyncSession = Depends(get_session),
) -> dict:
    svc = AuthService(session)
    result = await svc.login(
        email=body.email, password=body.password, mfa_code=body.mfa_code, meta=_meta(request)
    )
    _set_refresh_cookie(response, result.refresh_raw)
    payload = LoginResponse(
        access_token=result.access.access_token,
        expires_in=result.access.expires_in,
        user=UserRead.model_validate(result.user),
    )
    return success(payload.model_dump())


@router.post("/refresh", summary="Rotate refresh token → new access token")
async def refresh(
    request: Request, response: Response, session: AsyncSession = Depends(get_session)
) -> dict:
    raw = request.cookies.get(REFRESH_COOKIE)
    if not raw:
        from app.core.exceptions import Unauthenticated

        raise Unauthenticated("Missing refresh token", code="INVALID_REFRESH")
    svc = AuthService(session)
    access, new_raw = await svc.refresh(refresh_raw=raw, meta=_meta(request))
    _set_refresh_cookie(response, new_raw)  # rotation: replace the cookie
    return success(RefreshResponse(
        access_token=access.access_token, expires_in=access.expires_in
    ).model_dump())


@router.post("/logout", summary="Revoke session + refresh family")
async def logout(
    request: Request, response: Response, session: AsyncSession = Depends(get_session)
) -> dict:
    raw = request.cookies.get(REFRESH_COOKIE)
    svc = AuthService(session)
    await svc.logout(
        refresh_raw=raw, session_id=None, user_id=None, tenant_id=None, meta=_meta(request)
    )
    _clear_refresh_cookie(response)
    return success(MessageResponse(message="Logged out").model_dump())


# ── profile bootstrap ─────────────────────────────────────────────────────────
@router.get("/me", summary="Profile + roles + permissions + flags (frontend bootstrap)")
async def me(
    current: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    from app.modules.users.service import me_context

    user = await UserRepository(session).get(current.id)
    ctx = await me_context(session, user)
    return success({
        "user": UserRead.model_validate(user).model_dump(),
        "roles": ctx["roles"],
        "permissions": ctx["permissions"],
        "flags": ctx["flags"],
    })


# ── sessions ─────────────────────────────────────────────────────────────────
@router.get("/sessions", summary="List active sessions (my devices)")
async def list_sessions(
    current: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    svc = AuthService(session)
    rows = await svc.list_sessions(user_id=current.id, current_session_id=current.session_id)
    items = []
    for s, is_current in rows:
        read = SessionRead.model_validate(s)
        read.current = is_current
        items.append(read.model_dump())
    return success(items)


@router.delete("/sessions/{session_id}", summary="Revoke a session")
async def revoke_session(
    session_id: uuid.UUID, request: Request,
    current: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    svc = AuthService(session)
    await svc.revoke_session(
        user_id=current.id, tenant_id=current.tenant_id, session_id=session_id, meta=_meta(request)
    )
    return success(MessageResponse(message="Session revoked").model_dump())


# ── password reset ─────────────────────────────────────────────────────────────
@router.post("/forgot-password", summary="Request a password-reset email")
async def forgot_password(
    body: ForgotPasswordRequest, request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    await AuthService(session).forgot_password(email=body.email, meta=_meta(request))
    return success(MessageResponse(
        message="If the email exists, a reset link has been sent"
    ).model_dump())


@router.post("/reset-password", summary="Complete a password reset")
async def reset_password(
    body: ResetPasswordRequest, request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    await AuthService(session).reset_password(
        token=body.token, new_password=body.new_password, meta=_meta(request)
    )
    return success(MessageResponse(message="Password reset").model_dump())


# ── MFA (TOTP) ─────────────────────────────────────────────────────────────────
@router.post("/mfa/setup", summary="Begin TOTP enrolment")
async def mfa_setup(
    current: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await UserRepository(session).get(current.id)
    secret, uri = await AuthService(session).mfa_setup(user=user)
    return success(MfaSetupResponse(secret=secret, otpauth_uri=uri).model_dump())


@router.post("/mfa/verify", summary="Confirm TOTP code → enable MFA")
async def mfa_verify(
    body: MfaVerifyRequest, request: Request,
    current: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await UserRepository(session).get(current.id)
    await AuthService(session).mfa_verify(user=user, code=body.code, meta=_meta(request))
    return success(MessageResponse(message="MFA enabled").model_dump())


# ── OAuth SSO (behind env flags; stub-tested) ──────────────────────────────────
@router.get("/oauth/{provider}", summary="Begin OAuth login")
async def oauth_start(provider: str, request: Request):
    redirect_uri = f"{settings.frontend_url}/api/v1/auth/oauth/{provider}/callback"
    return await oauth.authorize_redirect(request, provider, redirect_uri)


@router.get("/oauth/{provider}/callback", summary="OAuth callback → session")
async def oauth_callback(
    provider: str, request: Request, response: Response,
    session: AsyncSession = Depends(get_session),
) -> dict:
    userinfo = await oauth.fetch_userinfo(request, provider)
    result = await AuthService(session).oauth_login(
        userinfo=userinfo, provider=provider, meta=_meta(request)
    )
    _set_refresh_cookie(response, result.refresh_raw)
    return success(LoginResponse(
        access_token=result.access.access_token,
        expires_in=result.access.expires_in,
        user=UserRead.model_validate(result.user),
    ).model_dump())
