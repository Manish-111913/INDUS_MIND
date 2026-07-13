"""Smoke tests — app boots, envelope + probes behave (docs/02 §13, §29)."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_healthz_ok(client):
    resp = await client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_request_id_header_present(client):
    resp = await client.get("/healthz")
    assert resp.headers.get("X-Request-ID")


@pytest.mark.asyncio
async def test_api_v1_root_success_envelope(client):
    resp = await client.get("/api/v1/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["api"] == "indusmind"
    assert body["data"]["version"] == "v1"


@pytest.mark.asyncio
async def test_unknown_route_error_envelope(client):
    resp = await client.get("/api/v1/does-not-exist")
    assert resp.status_code == 404
    err = resp.json()["error"]
    assert err["code"] == "NOT_FOUND"
    assert "request_id" in err
