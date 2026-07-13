"""Auth integration tests (docs/02 §6, §54).

Exercises login, refresh rotation, reuse detection, lockout, logout, /me and
MFA against real Postgres + Redis (compose services / `make test`). When those
backends aren't reachable (e.g. a bare local run) the whole module skips rather
than failing — the smoke suite still covers app boot without them.
"""

from __future__ import annotations

import uuid

import pyotp
import pytest
from sqlalchemy import text

from app.core.database import SessionFactory, engine
from app.core.redis import get_redis
from app.core.security import hash_password

# Ensure every model is registered on Base.metadata before create_all.
from app.modules.audit import models as _audit  # noqa: F401
from app.modules.auth import models as _auth  # noqa: F401
from app.modules.auth.models import User
from app.modules.tenants import models as _tenants  # noqa: F401
from app.modules.tenants.models import Tenant

PASSWORD = "S3cret-pass!"
_TABLES = "audit_log, refresh_tokens, sessions, users, tenants"


@pytest.fixture
async def db():
    """Ensure schema + a clean slate (Postgres rows + Redis) for each test.

    pytest-asyncio runs each test on its own event loop, but the app's async
    engine / redis client are module-global singletons whose connections bind to
    whichever loop created them. We create fresh connections on the current
    loop here and dispose them at teardown (while that loop is still alive) so
    nothing leaks across loops.
    """
    from app.common.base import Base
    from app.core import redis as core_redis

    try:
        async with engine.begin() as conn:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
            await conn.run_sync(Base.metadata.create_all)
            await conn.execute(text(f"TRUNCATE {_TABLES} RESTART IDENTITY CASCADE"))
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"Postgres not available: {exc}")

    try:
        await get_redis().flushdb()
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"Redis not available: {exc}")

    yield

    # Tear down on the same loop that created the connections.
    await engine.dispose()
    await core_redis.close_redis()


async def _seed_user(*, email: str = "user@acme.com", status: str = "active") -> tuple[Tenant, User]:
    async with SessionFactory() as s:
        tenant = Tenant(name="Acme", slug=f"acme-{uuid.uuid4().hex[:8]}")
        s.add(tenant)
        await s.flush()
        user = User(
            tenant_id=tenant.id, email=email, full_name="Test User",
            password_hash=hash_password(PASSWORD), status=status,
        )
        s.add(user)
        await s.commit()
        await s.refresh(tenant)
        await s.refresh(user)
        return tenant, user


# ── login ─────────────────────────────────────────────────────────────────────
async def test_login_success(db, client):
    await _seed_user()
    resp = await client.post("/api/v1/auth/login", json={"email": "user@acme.com", "password": PASSWORD})
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["access_token"]
    assert data["user"]["email"] == "user@acme.com"
    assert client.cookies.get("refresh_token")


async def test_login_wrong_password(db, client):
    await _seed_user()
    resp = await client.post("/api/v1/auth/login", json={"email": "user@acme.com", "password": "nope"})
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "INVALID_CREDENTIALS"


async def test_login_lockout_after_five_failures(db, client):
    await _seed_user()
    for _ in range(5):
        r = await client.post("/api/v1/auth/login", json={"email": "user@acme.com", "password": "x"})
        assert r.status_code == 401
    locked = await client.post("/api/v1/auth/login", json={"email": "user@acme.com", "password": PASSWORD})
    assert locked.status_code == 429
    assert locked.json()["error"]["code"] == "ACCOUNT_LOCKED"


# ── refresh rotation + reuse detection ─────────────────────────────────────────
async def test_refresh_rotation_and_reuse_detection(db, client):
    await _seed_user()
    login = await client.post("/api/v1/auth/login", json={"email": "user@acme.com", "password": PASSWORD})
    old_refresh = login.cookies["refresh_token"]

    rotated = await client.post("/api/v1/auth/refresh")
    assert rotated.status_code == 200
    new_refresh = client.cookies["refresh_token"]
    assert new_refresh != old_refresh

    # Replaying the OLD (now-rotated) token trips reuse detection.
    reuse = await client.post("/api/v1/auth/refresh", cookies={"refresh_token": old_refresh})
    assert reuse.status_code == 401
    assert reuse.json()["error"]["code"] == "TOKEN_REUSE"

    # Reuse revoked the whole family — the good token no longer works either.
    dead = await client.post("/api/v1/auth/refresh", cookies={"refresh_token": new_refresh})
    assert dead.status_code == 401


async def test_refresh_without_cookie(db, client):
    resp = await client.post("/api/v1/auth/refresh")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "INVALID_REFRESH"


# ── logout ─────────────────────────────────────────────────────────────────────
async def test_logout_revokes_refresh(db, client):
    await _seed_user()
    await client.post("/api/v1/auth/login", json={"email": "user@acme.com", "password": PASSWORD})
    out = await client.post("/api/v1/auth/logout")
    assert out.status_code == 200
    after = await client.post("/api/v1/auth/refresh")
    assert after.status_code == 401


# ── /me + auth guard ───────────────────────────────────────────────────────────
async def test_me_requires_token(db, client):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


async def test_me_returns_profile(db, client):
    await _seed_user()
    login = await client.post("/api/v1/auth/login", json={"email": "user@acme.com", "password": PASSWORD})
    token = login.json()["data"]["access_token"]
    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    data = me.json()["data"]
    assert data["user"]["email"] == "user@acme.com"
    assert "permissions" in data and "flags" in data


# ── MFA enrolment ──────────────────────────────────────────────────────────────
async def test_mfa_setup_and_verify(db, client):
    await _seed_user()
    login = await client.post("/api/v1/auth/login", json={"email": "user@acme.com", "password": PASSWORD})
    token = login.json()["data"]["access_token"]
    auth = {"Authorization": f"Bearer {token}"}

    setup = await client.post("/api/v1/auth/mfa/setup", headers=auth)
    assert setup.status_code == 200
    secret = setup.json()["data"]["secret"]

    code = pyotp.TOTP(secret).now()
    verify = await client.post("/api/v1/auth/mfa/verify", json={"code": code}, headers=auth)
    assert verify.status_code == 200

    # Subsequent password login now demands the MFA code.
    relogin = await client.post(
        "/api/v1/auth/login", json={"email": "user@acme.com", "password": PASSWORD}
    )
    assert relogin.status_code == 401
    assert relogin.json()["error"]["code"] == "MFA_REQUIRED"


# ── OAuth (unconfigured) ───────────────────────────────────────────────────────
async def test_oauth_provider_not_configured(client):
    resp = await client.get("/api/v1/auth/oauth/google", follow_redirects=False)
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "OAUTH_NOT_CONFIGURED"
