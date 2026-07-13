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

from app.main import app


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with LifespanManager(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac
