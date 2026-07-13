"""OAuth 2.0 / OIDC — Google / Microsoft SSO via authlib (docs/02 §6).

Behind env flags: a provider is only registered when its client id/secret are
configured. Account linking is by *verified* email. Auto-provisioning and the
per-tenant SSO-enforcement flag are users-module concerns; this ships the flow
and is stub-tested (unconfigured → OAUTH_NOT_CONFIGURED).
"""

from __future__ import annotations

from functools import lru_cache

from authlib.integrations.starlette_client import OAuth
from starlette.requests import Request

from app.core.config import settings
from app.core.exceptions import NotFound

_SUPPORTED = {"google", "microsoft"}


@lru_cache
def _oauth() -> OAuth:
    oauth = OAuth()
    if settings.oauth_google_client_id and settings.oauth_google_client_secret:
        oauth.register(
            name="google",
            client_id=settings.oauth_google_client_id,
            client_secret=settings.oauth_google_client_secret,
            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
            client_kwargs={"scope": "openid email profile"},
        )
    # Microsoft registers here once MS creds are added to settings (same shape).
    return oauth


def _client(provider: str):
    if provider not in _SUPPORTED:
        raise NotFound(f"Unknown OAuth provider: {provider}", code="OAUTH_UNKNOWN_PROVIDER")
    client = getattr(_oauth(), provider, None)
    if client is None:
        raise NotFound(f"OAuth provider not configured: {provider}", code="OAUTH_NOT_CONFIGURED")
    return client


async def authorize_redirect(request: Request, provider: str, redirect_uri: str):
    return await _client(provider).authorize_redirect(request, redirect_uri)


async def fetch_userinfo(request: Request, provider: str) -> dict:
    client = _client(provider)
    token = await client.authorize_access_token(request)
    userinfo = token.get("userinfo") or await client.userinfo(token=token)
    return dict(userinfo)
