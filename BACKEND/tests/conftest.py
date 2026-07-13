"""Test bootstrap (docs/02 §54).

`client` is an httpx ASGI client bound to the FastAPI app via asgi-lifespan so
startup/shutdown run. Smoke-level tests need no external services; module
integration suites (per §54) layer on real Postgres/Redis via compose /
testcontainers with an authz matrix.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.main import app

# Import every module's models so Base.metadata is complete before create_all.
from app.modules.audit import models as _audit  # noqa: F401
from app.modules.auth import models as _auth  # noqa: F401
from app.modules.documents import models as _documents  # noqa: F401
from app.modules.equipment import models as _equipment  # noqa: F401
from app.modules.ingestion import models as _ingestion  # noqa: F401
from app.modules.lookups import models as _lookups  # noqa: F401
from app.modules.tenants import models as _tenants  # noqa: F401
from app.modules.users import models as _users  # noqa: F401

# Truncated between tests (CASCADE handles FK order).
_TABLES = (
    "audit_log, feature_flags, lookups, user_roles, role_permissions, permissions, roles, "
    "document_chunks, ingestion_jobs, document_versions, documents, "
    "equipment, areas, plants, refresh_tokens, sessions, users, tenants"
)


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with LifespanManager(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac


@pytest.fixture
async def db():
    """Fresh schema + clean Postgres rows + flushed Redis for each test.

    Connections are created on the current test's event loop and disposed at
    teardown (see the note in the fixture body) so nothing leaks across loops.
    Skips the test if Postgres/Redis aren't reachable (bare local run).
    """
    from app.common.base import Base
    from app.core import redis as core_redis
    from app.core.database import engine
    from app.core.redis import get_redis

    try:
        async with engine.begin() as conn:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            await conn.run_sync(Base.metadata.create_all)
            # audit_log has an append-only trigger (migration 0003); create_all
            # won't add it, but tests only INSERT into it, so that's fine.
            await conn.execute(text(f"TRUNCATE {_TABLES} RESTART IDENTITY CASCADE"))
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"Postgres not available: {exc}")

    try:
        await get_redis().flushdb()
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"Redis not available: {exc}")

    yield

    await engine.dispose()
    await core_redis.close_redis()


@pytest.fixture
async def minio(db):
    """Ensure the bucket exists and MinIO is reachable, else skip (docs/02 §12)."""
    import asyncio

    from app.core import storage
    from app.core.config import settings

    try:
        try:
            await asyncio.to_thread(storage._client().create_bucket, Bucket=settings.s3_bucket)
        except Exception:  # noqa: BLE001 — already exists / owned
            pass
        await asyncio.to_thread(storage.ping)
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"MinIO not available: {exc}")
    yield
