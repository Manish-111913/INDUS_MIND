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
from app.modules.ai import models as _ai  # noqa: F401
from app.modules.analytics import models as _analytics  # noqa: F401
from app.modules.audit import models as _audit  # noqa: F401
from app.modules.auth import models as _auth  # noqa: F401
from app.modules.compliance import models as _compliance  # noqa: F401
from app.modules.content import models as _content  # noqa: F401
from app.modules.dashboards import models as _dashboards  # noqa: F401
from app.modules.dataops import models as _dataops  # noqa: F401
from app.modules.documents import models as _documents  # noqa: F401
from app.modules.equipment import models as _equipment  # noqa: F401
from app.modules.i18n import models as _i18n  # noqa: F401
from app.modules.ingestion import models as _ingestion  # noqa: F401
from app.modules.integrations import models as _integrations  # noqa: F401
from app.modules.knowledge import models as _knowledge  # noqa: F401
from app.modules.lessons import models as _lessons  # noqa: F401
from app.modules.logbook import models as _logbook  # noqa: F401
from app.modules.lookups import models as _lookups  # noqa: F401
from app.modules.maintenance import models as _maintenance  # noqa: F401
from app.modules.meters import models as _meters  # noqa: F401
from app.modules.notifications import models as _notifications  # noqa: F401
from app.modules.onboarding import models as _onboarding  # noqa: F401
from app.modules.parts import models as _parts  # noqa: F401
from app.modules.preferences import models as _preferences  # noqa: F401
from app.modules.quality import models as _quality  # noqa: F401
from app.modules.retention import models as _retention  # noqa: F401
from app.modules.settings import models as _settings  # noqa: F401
from app.modules.tenants import models as _tenants  # noqa: F401
from app.modules.users import models as _users  # noqa: F401


def _all_tables() -> str:
    """Every mapped table, for the between-test TRUNCATE.

    Derived from the metadata rather than hand-listed: a literal list silently
    rots — a table nobody remembers to add is never truncated, so each test's seed
    creates a fresh tenant while the previous run's rows linger, and the leak
    compounds across runs. (Not hypothetical: extraction_rules stranded 454
    orphaned rows across 65 dead tenants this way.) CASCADE handles FK order, so
    ordering doesn't matter. alembic_version isn't mapped, so it's excluded — which
    is what we want; dropping it would strip the migration state.
    """
    from app.common.base import Base

    return ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)


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
            await conn.execute(text(f"TRUNCATE {_all_tables()} RESTART IDENTITY CASCADE"))
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"Postgres not available: {exc}")

    try:
        await get_redis().flushdb()
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"Redis not available: {exc}")

    yield

    from app.core import graph as core_graph

    await engine.dispose()
    await core_redis.close_redis()
    await core_graph.close_driver()  # reset the Neo4j driver so each test rebinds to its loop


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


@pytest.fixture
async def neo4j(db):
    """Fresh Neo4j driver on the test loop + clean graph, else skip (docs/02 §9)."""
    from app.core import graph
    from app.modules.knowledge import service as knowledge_service

    await graph.close_driver()
    knowledge_service._schema_ready = False
    try:
        await graph.ping()
        await graph.run_write("MATCH (n) DETACH DELETE n")  # isolate tests
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"Neo4j not available: {exc}")
    yield
    try:
        await graph.close_driver()
    except Exception:  # noqa: BLE001
        pass
