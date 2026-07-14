"""Documents module tests (docs/02 §12, §17).

The full upload flow runs against a real MinIO (compose / a local container):
presign → PUT the object directly → confirm (checksum + MIME sniff) → job. When
MinIO isn't reachable the S3-dependent tests skip; validation tests still run.
"""

from __future__ import annotations

import hashlib

import httpx

from seeds.seed import DEMO_PASSWORD
from seeds.seed import run as seed_run

PDF_BYTES = b"%PDF-1.4\n%mock pump maintenance manual\n1 0 obj<<>>endobj\n"


async def _admin_headers(client) -> dict:
    resp = await client.post("/api/v1/auth/login",
                             json={"email": "admin@indusmind.io", "password": DEMO_PASSWORD})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['data']['access_token']}"}


async def _lookup_id(client, headers, category: str, code: str) -> str:
    rows = (await client.get(f"/api/v1/lookups/{category}", headers=headers)).json()["data"]
    return next(r["id"] for r in rows if r["code"] == code)


async def _plant_id(client, headers, code: str = "JAM") -> str:
    plants = (await client.get("/api/v1/plants", headers=headers)).json()["data"]
    return next(p["id"] for p in plants if p["code"] == code)


async def _put_object(url: str, content: bytes, mime: str) -> None:
    async with httpx.AsyncClient(timeout=30) as s3:
        resp = await s3.put(url, content=content, headers={"Content-Type": mime})
        assert resp.status_code in (200, 204), f"S3 PUT failed: {resp.status_code} {resp.text}"


# ── full presign → PUT → confirm → job flow ───────────────────────────────────
async def test_upload_confirm_flow(db, minio, client):
    await seed_run()
    headers = await _admin_headers(client)
    doc_type = await _lookup_id(client, headers, "doc_types", "manual")
    plant_id = await _plant_id(client, headers)
    checksum = hashlib.sha256(PDF_BYTES).hexdigest()

    up = await client.post("/api/v1/documents/upload-url", headers=headers, json={
        "filename": "pump-manual.pdf", "mime": "application/pdf", "size": len(PDF_BYTES),
        "title": "Pump Maintenance Manual"})
    assert up.status_code == 201, up.text
    d = up.json()["data"]
    doc_id = d["document_id"]
    assert d["storage_key"].startswith("tenant/") and d["storage_key"].endswith("/v1/original.pdf")

    await _put_object(d["presigned_url"], PDF_BYTES, "application/pdf")

    confirmed = await client.post(f"/api/v1/documents/{doc_id}/confirm", headers=headers, json={
        "checksum": checksum,
        "meta": {"doc_type_id": doc_type, "plant_id": plant_id, "tags": ["pump", "manual"]}})
    assert confirmed.status_code == 200, confirmed.text
    body = confirmed.json()["data"]
    assert body["ingestion_status"] == "pending"
    assert body["tags"] == ["pump", "manual"]

    # detail exposes the ingestion job with its pipeline stages
    detail = (await client.get(f"/api/v1/documents/{doc_id}", headers=headers)).json()["data"]
    assert detail["job"] is not None
    assert [s["stage"] for s in detail["job"]["stages"]] == \
        ["ocr", "parsing", "chunking", "embedding", "extracting", "graphing"]

    # list filters: tag + FTS on title
    tagged = (await client.get("/api/v1/documents", headers=headers,
                               params={"tag": "pump"})).json()["data"]
    assert doc_id in {x["id"] for x in tagged}
    fts = (await client.get("/api/v1/documents", headers=headers,
                            params={"q": "maintenance"})).json()["data"]
    assert doc_id in {x["id"] for x in fts}

    # download-url + versions
    dl = await client.get(f"/api/v1/documents/{doc_id}/download-url", headers=headers)
    assert dl.status_code == 200 and dl.json()["data"]["url"].startswith("http")
    versions = (await client.get(f"/api/v1/documents/{doc_id}/versions",
                                 headers=headers)).json()["data"]
    assert len(versions) == 1 and versions[0]["version_no"] == 1
    assert versions[0]["confirmed_at"] is not None

    # thumbnail not generated yet → 404 fallback
    th = await client.get(f"/api/v1/documents/{doc_id}/pages/1/thumbnail", headers=headers)
    assert th.status_code == 404 and th.json()["error"]["code"] == "THUMBNAIL_NOT_AVAILABLE"

    # reprocess from a stage → fresh job scoped to remaining stages
    rp = await client.post(f"/api/v1/documents/{doc_id}/reprocess", headers=headers,
                           json={"from_stage": "chunking"})
    assert rp.status_code == 200
    assert [s["stage"] for s in rp.json()["data"]["stages"]] == \
        ["chunking", "embedding", "extracting", "graphing"]

    # soft delete
    assert (await client.delete(f"/api/v1/documents/{doc_id}", headers=headers)).status_code == 200
    assert (await client.get(f"/api/v1/documents/{doc_id}", headers=headers)).status_code == 404


async def test_confirm_checksum_mismatch(db, minio, client):
    await seed_run()
    headers = await _admin_headers(client)
    up = await client.post("/api/v1/documents/upload-url", headers=headers, json={
        "filename": "x.pdf", "mime": "application/pdf", "size": len(PDF_BYTES)})
    d = up.json()["data"]
    await _put_object(d["presigned_url"], PDF_BYTES, "application/pdf")
    bad = await client.post(f"/api/v1/documents/{d['document_id']}/confirm", headers=headers,
                            json={"checksum": "deadbeef" * 8, "meta": {}})
    assert bad.status_code == 422
    assert bad.json()["error"]["code"] == "CHECKSUM_MISMATCH"


async def test_confirm_before_upload_fails(db, minio, client):
    await seed_run()
    headers = await _admin_headers(client)
    up = await client.post("/api/v1/documents/upload-url", headers=headers, json={
        "filename": "y.pdf", "mime": "application/pdf", "size": 10})
    # no PUT — object absent
    resp = await client.post(f"/api/v1/documents/{up.json()['data']['document_id']}/confirm",
                             headers=headers, json={"checksum": "a" * 16, "meta": {}})
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "OBJECT_NOT_FOUND"


# ── validation (no MinIO needed) ──────────────────────────────────────────────
async def test_upload_url_rejects_bad_mime(db, client):
    await seed_run()
    headers = await _admin_headers(client)
    resp = await client.post("/api/v1/documents/upload-url", headers=headers, json={
        "filename": "evil.exe", "mime": "application/x-msdownload", "size": 100})
    assert resp.status_code == 422
    assert "mime" in resp.json()["error"]["field_errors"]


async def test_upload_url_rejects_oversize(db, client):
    await seed_run()
    headers = await _admin_headers(client)
    resp = await client.post("/api/v1/documents/upload-url", headers=headers, json={
        "filename": "big.pdf", "mime": "application/pdf", "size": 200 * 1024 * 1024})
    assert resp.status_code == 422
    assert "size" in resp.json()["error"]["field_errors"]


# ── new version → re-ingest ───────────────────────────────────────────────────
async def test_new_version_reingest(db, minio, client):
    await seed_run()
    headers = await _admin_headers(client)
    checksum = hashlib.sha256(PDF_BYTES).hexdigest()

    up = await client.post("/api/v1/documents/upload-url", headers=headers, json={
        "filename": "sop.pdf", "mime": "application/pdf", "size": len(PDF_BYTES)})
    doc_id = up.json()["data"]["document_id"]
    await _put_object(up.json()["data"]["presigned_url"], PDF_BYTES, "application/pdf")
    await client.post(f"/api/v1/documents/{doc_id}/confirm", headers=headers,
                      json={"checksum": checksum, "meta": {}})

    # create v2
    v2 = await client.post(f"/api/v1/documents/{doc_id}/versions", headers=headers, json={
        "filename": "sop.pdf", "mime": "application/pdf", "size": len(PDF_BYTES), "notes": "rev B"})
    assert v2.status_code == 201, v2.text
    assert v2.json()["data"]["version_no"] == 2
    await _put_object(v2.json()["data"]["presigned_url"], PDF_BYTES, "application/pdf")

    # confirm finalizes the current (v2) version → re-ingest
    reconf = await client.post(f"/api/v1/documents/{doc_id}/confirm", headers=headers,
                               json={"checksum": checksum, "meta": {}})
    assert reconf.status_code == 200
    versions = {v["version_no"]: v for v in
                (await client.get(f"/api/v1/documents/{doc_id}/versions",
                                  headers=headers)).json()["data"]}
    assert set(versions) == {1, 2}
    assert versions[2]["confirmed_at"] is not None  # v2 finalized (re-ingest)
    # current version now points at v2's id
    assert reconf.json()["data"]["current_version_id"] == versions[2]["id"]
