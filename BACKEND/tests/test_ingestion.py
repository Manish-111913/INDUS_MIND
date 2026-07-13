"""Ingestion pipeline + admin + WebSocket tests (docs/02 §10, §11, §35).

The pipeline runs for real against MinIO with PyMuPDF extraction and the
deterministic embedding fallback (no GPU/model download), so chunks, vectors and
thumbnails are all produced and verified. Tests skip cleanly when MinIO/Redis
aren't reachable.
"""

from __future__ import annotations

import hashlib
import json
import uuid

import httpx
import pytest

from app.core import storage
from app.core.config import settings
from app.core.database import SessionFactory
from app.modules.ingestion.pipeline import run_pipeline
from app.modules.ingestion.repository import ChunkRepository
from seeds.sample_data import generate_pdf
from seeds.seed import DEMO_PASSWORD
from seeds.seed import run as seed_run


async def _headers(client, email: str = "admin@indusmind.io") -> dict:
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['data']['access_token']}"}


async def _tenant_id(client, headers) -> str:
    me = (await client.get("/api/v1/auth/me", headers=headers)).json()["data"]
    return me["user"]["tenant_id"]


async def _upload_and_confirm(client, headers, pdf: bytes, filename: str) -> str:
    up = await client.post("/api/v1/documents/upload-url", headers=headers, json={
        "filename": filename, "mime": "application/pdf", "size": len(pdf), "title": filename})
    d = up.json()["data"]
    async with httpx.AsyncClient(timeout=30) as s3:
        put = await s3.put(d["presigned_url"], content=pdf, headers={"Content-Type": "application/pdf"})
        assert put.status_code in (200, 204), put.text
    conf = await client.post(f"/api/v1/documents/{d['document_id']}/confirm", headers=headers,
                             json={"checksum": hashlib.sha256(pdf).hexdigest(), "meta": {}})
    assert conf.status_code == 200, conf.text
    return d["document_id"]


# ── pipeline end-to-end ───────────────────────────────────────────────────────
async def test_pipeline_produces_chunks_embeddings_thumbnails(db, minio, client):
    await seed_run()
    headers = await _headers(client)
    tenant_id = await _tenant_id(client, headers)
    pdf = generate_pdf("Pump P-101 Maintenance Manual", [
        "Bonnet bolt torque specification for P-101 is 210 Nm applied in a star pattern. " * 12,
        "Mechanical seal type John Crane 5610 with API Plan 11 flush. Bearing oil ISO VG 68. " * 12,
    ])
    doc_id = await _upload_and_confirm(client, headers, pdf, "p101.pdf")

    # Run the pipeline (as the worker would) on a fresh session.
    async with SessionFactory() as session:
        job = await run_pipeline(session, tenant_id, doc_id)
        await session.commit()
    assert job.status == "completed"

    # Document reaches 'completed'; B5 stages done, B6 stages skipped.
    detail = (await client.get(f"/api/v1/documents/{doc_id}", headers=headers)).json()["data"]
    assert detail["ingestion_status"] == "completed"
    statuses = {s["stage"]: s["status"] for s in detail["job"]["stages"]}
    assert statuses["ocr"] == "completed"
    assert statuses["chunking"] == "completed"
    assert statuses["embedding"] == "completed"
    assert statuses["extracting"] == "skipped"
    assert detail["job"]["durations"].get("embedding") is not None

    # Chunks exist with real 1024-dim vectors.
    async with SessionFactory() as session:
        chunks = await ChunkRepository(session, tenant_id).list_for_document(doc_id)
    assert len(chunks) >= 1
    assert all(c.embedding is not None for c in chunks)
    assert len(chunks[0].embedding) == 1024
    assert all(c.checksum for c in chunks)

    # Thumbnails rendered to storage.
    key = storage.thumbnail_key(tenant_id, doc_id, 1)
    import asyncio
    assert await asyncio.to_thread(storage.object_exists, key)


async def test_pipeline_is_idempotent(db, minio, client):
    await seed_run()
    headers = await _headers(client)
    tenant_id = await _tenant_id(client, headers)
    pdf = generate_pdf("SOP-114 Firewater Test", ["Run FW-P1 for 30 minutes at rated flow. " * 20])
    doc_id = await _upload_and_confirm(client, headers, pdf, "sop.pdf")

    async with SessionFactory() as session:
        await run_pipeline(session, tenant_id, doc_id)
        await session.commit()
    async with SessionFactory() as session:
        first = await ChunkRepository(session, tenant_id).count_for_document(doc_id)
        await run_pipeline(session, tenant_id, doc_id)  # re-run → rebuild, no duplication
        await session.commit()
        second = await ChunkRepository(session, tenant_id).count_for_document(doc_id)
    assert first >= 1 and first == second


# ── admin job monitor ─────────────────────────────────────────────────────────
async def test_ingestion_jobs_admin(db, minio, client):
    await seed_run()
    admin = await _headers(client)
    tenant_id = await _tenant_id(client, admin)
    pdf = generate_pdf("Incident Report", ["P-101 tripped on high vibration. " * 20])
    doc_id = await _upload_and_confirm(client, admin, pdf, "incident.pdf")
    async with SessionFactory() as session:
        await run_pipeline(session, tenant_id, doc_id)
        await session.commit()

    jobs = await client.get("/api/v1/ingestion/jobs", headers=admin)
    assert jobs.status_code == 200
    rows = jobs.json()["data"]
    assert any(j["document_id"] == doc_id and j["status"] == "completed" for j in rows)
    job_id = next(j["id"] for j in rows if j["document_id"] == doc_id)

    # technician lacks doc.reprocess → 403
    tech = await _headers(client, "technician@indusmind.io")
    assert (await client.get("/api/v1/ingestion/jobs", headers=tech)).status_code == 403

    # retry resets to pending; cancel then marks cancelled
    retried = await client.post(f"/api/v1/ingestion/jobs/{job_id}/retry", headers=admin)
    assert retried.status_code == 200 and retried.json()["data"]["status"] == "pending"
    cancelled = await client.post(f"/api/v1/ingestion/jobs/{job_id}/cancel", headers=admin)
    assert cancelled.status_code == 200 and cancelled.json()["data"]["status"] == "cancelled"


# ── WebSocket (docs/02 §35) — sync TestClient ─────────────────────────────────
def _skip_if_no_redis() -> None:
    import redis as redis_sync

    try:
        redis_sync.from_url(settings.redis_url).ping()
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"Redis not available: {exc}")


def test_ws_rejects_without_token():
    _skip_if_no_redis()
    from starlette.testclient import TestClient
    from starlette.websockets import WebSocketDisconnect

    from app.main import app

    with TestClient(app) as tc, pytest.raises(WebSocketDisconnect):
        with tc.websocket_connect("/ws"):
            pass


def test_ws_accepts_and_relays_progress():
    _skip_if_no_redis()
    import redis as redis_sync
    from starlette.testclient import TestClient

    from app.main import app
    from app.modules.auth.tokens import build_access_token

    tenant_id = uuid.uuid4()
    token = build_access_token(user_id=uuid.uuid4(), tenant_id=tenant_id, roles=[],
                               perm_hash="x", token_version=0, session_id=uuid.uuid4()).token
    with TestClient(app) as tc:
        with tc.websocket_connect(f"/ws?token={token}") as ws:
            assert ws.receive_json()["type"] == "connected"  # subscription live
            redis_sync.from_url(settings.redis_url).publish(
                f"ws:tenant:{tenant_id}",
                json.dumps({"type": "ingestion.progress", "job_id": "j1", "stage": "chunking", "pct": 42}))
            msg = ws.receive_json()
            assert msg["type"] == "ingestion.progress" and msg["pct"] == 42
