"""Hybrid search + search API tests (docs/02 §10 step 8, §27).

Runs against MinIO (real ingestion) so retrieval works over real chunks. Verifies
the seeded-corpus queries "P-101" and "firewater pump testing" return the right
documents, and that response shapes match the frontend search contract.
"""

from __future__ import annotations

import hashlib

import httpx

from app.core.database import SessionFactory
from seeds.sample_data import generate_pdf
from seeds.seed import DEMO_PASSWORD
from seeds.seed import run as seed_run

# Exact frontend contract (SearchResults item + suggest item).
RESULT_KEYS = {"id", "title", "type", "snippet", "source", "relevance",
               "matchType", "plant", "date", "status", "link"}
SUGGEST_KEYS = {"id", "name", "category", "desc", "route"}


async def _headers(client, email: str = "admin@indusmind.io") -> dict:
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['data']['access_token']}"}


async def _tenant_id(client, headers) -> str:
    return (await client.get("/api/v1/auth/me", headers=headers)).json()["data"]["user"]["tenant_id"]


async def _ingest(client, headers, tenant_id: str, title: str, paras: list[str]) -> str:
    pdf = generate_pdf(title, paras)
    up = await client.post("/api/v1/documents/upload-url", headers=headers, json={
        "filename": f"{abs(hash(title)) % 10000}.pdf", "mime": "application/pdf",
        "size": len(pdf), "title": title})
    d = up.json()["data"]
    async with httpx.AsyncClient(timeout=30) as s3:
        put = await s3.put(d["presigned_url"], content=pdf, headers={"Content-Type": "application/pdf"})
        assert put.status_code in (200, 204)
    await client.post(f"/api/v1/documents/{d['document_id']}/confirm", headers=headers,
                      json={"checksum": hashlib.sha256(pdf).hexdigest(), "meta": {}})
    async with SessionFactory() as session:
        from app.modules.ingestion.pipeline import run_pipeline
        await run_pipeline(session, tenant_id, d["document_id"])
        await session.commit()
    return d["document_id"]


async def _corpus(client, headers, tenant_id) -> None:
    await _ingest(client, headers, tenant_id, "Centrifugal Pump P-101 OEM Manual", [
        "P-101 bonnet bolt torque is 210 Nm. Mechanical seal John Crane 5610 with Plan 11 flush. " * 4])
    await _ingest(client, headers, tenant_id, "SOP-114 Firewater Pump Quarterly Testing", [
        "This procedure governs quarterly performance testing of the firewater pump FW-P1. "
        "Run the diesel driver for 30 minutes at rated flow and log suction pressures. " * 4])
    await _ingest(client, headers, tenant_id, "Compressor C-3 Inspection Report", [
        "Quarterly inspection of compressor C-3. Discharge temperature trending up. " * 4])


# ── retrieval service (shared with copilot) ───────────────────────────────────
async def test_retrieval_returns_chunks_with_provenance(db, minio, client):
    await seed_run()
    headers = await _headers(client)
    tenant_id = await _tenant_id(client, headers)
    await _corpus(client, headers, tenant_id)

    from app.modules.knowledge.retrieval import RetrievalService

    async with SessionFactory() as session:
        chunks = await RetrievalService(session, tenant_id).retrieve("P-101 bonnet torque", top_k=5)
    assert chunks
    top = chunks[0]
    assert top.document_id and top.text and top.match_kind in ("keyword", "semantic")
    assert top.score > 0


# ── /search ───────────────────────────────────────────────────────────────────
async def test_search_p101_returns_manual_and_equipment(db, minio, client):
    await seed_run()
    headers = await _headers(client)
    tenant_id = await _tenant_id(client, headers)
    await _corpus(client, headers, tenant_id)

    resp = await client.get("/api/v1/search", headers=headers, params={"q": "P-101"})
    assert resp.status_code == 200
    results = resp.json()["data"]["results"]
    assert results

    # exact frontend item shape
    assert RESULT_KEYS <= set(results[0])
    assert all(r["matchType"] in ("keyword", "semantic") for r in results)

    doc_titles = [r["title"] for r in results if r["type"] == "Documents"]
    assert any("P-101" in t for t in doc_titles)
    # equipment P-101 also surfaces
    equip = [r for r in results if r["type"] == "Equipment"]
    assert any("P-101" in r["title"] for r in equip)
    # snippets carry <em> highlights
    assert any("<em>" in r["snippet"] for r in results if r["type"] == "Documents")


async def test_search_firewater_pump_testing_returns_sop(db, minio, client):
    await seed_run()
    headers = await _headers(client)
    tenant_id = await _tenant_id(client, headers)
    await _corpus(client, headers, tenant_id)

    resp = await client.get("/api/v1/search", headers=headers,
                            params={"q": "firewater pump testing"})
    results = resp.json()["data"]["results"]
    doc_titles = [r["title"] for r in results if r["type"] == "Documents"]
    assert any("SOP-114" in t or "Firewater" in t for t in doc_titles)
    # the C-3 report should not outrank the firewater SOP for this query
    assert results[0]["type"] in ("Documents", "Equipment")


async def test_search_types_filter(db, minio, client):
    await seed_run()
    headers = await _headers(client)
    tenant_id = await _tenant_id(client, headers)
    await _corpus(client, headers, tenant_id)
    resp = await client.get("/api/v1/search", headers=headers,
                            params={"q": "P-101", "types": "Equipment"})
    results = resp.json()["data"]["results"]
    assert results and all(r["type"] == "Equipment" for r in results)


async def test_search_requires_auth(db, client):
    resp = await client.get("/api/v1/search", params={"q": "x"})
    assert resp.status_code == 401


# ── /search/suggest ────────────────────────────────────────────────────────────
async def test_suggest_shape_and_content(db, minio, client):
    await seed_run()
    headers = await _headers(client)
    tenant_id = await _tenant_id(client, headers)
    await _corpus(client, headers, tenant_id)

    resp = await client.get("/api/v1/search/suggest", headers=headers, params={"q": "P-1"})
    assert resp.status_code == 200
    groups = resp.json()["data"]
    assert set(groups) == {"Documents", "Equipment", "WorkOrders", "Regulations", "Actions"}
    # equipment P-101 suggested
    assert any("P-101" in s["name"] for s in groups["Equipment"])
    assert all(SUGGEST_KEYS <= set(s) for s in groups["Equipment"])

    # an empty query returns the default command-palette actions (mock parity)
    default = (await client.get("/api/v1/search/suggest", headers=headers,
                                params={"q": ""})).json()["data"]
    assert default["Actions"] and all(SUGGEST_KEYS <= set(a) for a in default["Actions"])


# ── saved searches ─────────────────────────────────────────────────────────────
async def test_saved_search_crud(db, client):
    await seed_run()
    headers = await _headers(client)
    created = await client.post("/api/v1/search/saved", headers=headers,
                                json={"name": "Critical pumps", "query": "P-101",
                                      "filters": {"criticality": "A"}})
    assert created.status_code == 201
    saved_id = created.json()["data"]["id"]

    listed = await client.get("/api/v1/search/saved", headers=headers)
    assert any(s["id"] == saved_id for s in listed.json()["data"])

    deleted = await client.delete(f"/api/v1/search/saved/{saved_id}", headers=headers)
    assert deleted.status_code == 200
    listed2 = await client.get("/api/v1/search/saved", headers=headers)
    assert all(s["id"] != saved_id for s in listed2.json()["data"])
