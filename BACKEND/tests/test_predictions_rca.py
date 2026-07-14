"""Predictions + RCA agent tests (docs/02 §10 agents, §14, §15).

Predictions run over the seeded maintenance history (no external services). RCA
additionally ingests the P-101 corpus (MinIO) so causes cite manual/inspection
chunks as well as the failure history. Offline/extractive LLM path throughout.
"""

from __future__ import annotations

import hashlib

import httpx

from app.core.database import SessionFactory
from seeds.sample_data import generate_pdf
from seeds.seed import DEMO_PASSWORD
from seeds.seed import run as seed_run


async def _login(client, email: str = "engineer@indusmind.io") -> dict:
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['data']['access_token']}"}


async def _tenant_id(client, headers) -> str:
    return (await client.get("/api/v1/auth/me", headers=headers)).json()["data"]["user"]["tenant_id"]


async def _equipment_id(client, headers, tag: str) -> str:
    resp = await client.get("/api/v1/equipment/resolve", headers=headers, params={"tag": tag})
    matches = resp.json()["data"]["matches"]
    return next(m["id"] for m in matches if m["tag"] == tag)


# ── predictions ────────────────────────────────────────────────────────────────
async def test_predictions_list_shows_p101_and_fw_p1(db, client):
    await seed_run()
    headers = await _login(client)
    p101 = await _equipment_id(client, headers, "P-101")
    fwp1 = await _equipment_id(client, headers, "FW-P1")

    resp = await client.get("/api/v1/maintenance/predictions", headers=headers,
                            params={"page_size": 100})
    assert resp.status_code == 200
    preds = {p["equipment_id"]: p for p in resp.json()["data"]}
    assert p101 in preds, "P-101 (recurring seal failures) should be predicted"
    assert fwp1 in preds, "FW-P1 (overdue firewater test) should be predicted"

    p = preds[p101]
    # explainable drivers + recommendation cite the history
    factors = {d["factor"] for d in p["drivers"]}
    assert "failure_frequency" in factors and "repeat_failure_mode" in factors
    assert p["recommendation"] and p["citations"]
    assert p["risk_band"] in ("high", "medium", "low")
    # P-101 (3 failures) outranks FW-P1 (overdue only)
    assert float(p["risk_score"]) > float(preds[fwp1]["risk_score"])
    # FW-P1's driver set includes the overdue schedule
    assert any(d["factor"] == "overdue_maintenance" for d in preds[fwp1]["drivers"])


async def test_prediction_accept_creates_work_order(db, client):
    await seed_run()
    headers = await _login(client)
    p101 = await _equipment_id(client, headers, "P-101")
    preds = {p["equipment_id"]: p for p in (await client.get(
        "/api/v1/maintenance/predictions", headers=headers, params={"page_size": 100})).json()["data"]}
    pred = preds[p101]

    acc = await client.post(f"/api/v1/maintenance/predictions/{pred['id']}/accept", headers=headers)
    assert acc.status_code == 200, acc.text
    data = acc.json()["data"]
    assert data["status"] == "accepted" and data["acted_wo_id"]
    wo_id = data["work_order_id"]

    wo = (await client.get(f"/api/v1/work-orders/{wo_id}", headers=headers)).json()["data"]
    assert wo["source"] == "prediction"
    assert wo["equipment_id"] == p101


async def test_prediction_dismiss_stores_reason(db, client):
    await seed_run()
    headers = await _login(client)
    fwp1 = await _equipment_id(client, headers, "FW-P1")
    preds = {p["equipment_id"]: p for p in (await client.get(
        "/api/v1/maintenance/predictions", headers=headers, params={"page_size": 100})).json()["data"]}
    pred = preds[fwp1]

    dismissed = await client.post(f"/api/v1/maintenance/predictions/{pred['id']}/dismiss",
                                  headers=headers, json={"reason": "test already scheduled offline"})
    assert dismissed.status_code == 200
    body = dismissed.json()["data"]
    assert body["status"] == "dismissed"
    assert body["dismiss_reason"] == "test already scheduled offline"


# ── RCA agent ──────────────────────────────────────────────────────────────────
async def _ingest(client, headers, tenant_id, title, paras):
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


async def test_rca_run_produces_cited_causes(db, minio, client):
    await seed_run()
    headers = await _login(client)
    tenant_id = await _tenant_id(client, headers)
    await _ingest(client, headers, tenant_id, "Centrifugal Pump P-101 OEM Manual", [
        "P-101 mechanical seal is a John Crane 5610 on API Plan 11 flush. Seal failures trace to "
        "flush-line blockage and coupling misalignment. Torque bonnet bolts to 210 Nm. " * 3])

    p101 = await _equipment_id(client, headers, "P-101")
    failures = (await client.get("/api/v1/failures", headers=headers,
                                 params={"equipment_id": p101})).json()["data"]
    assert failures, "P-101 should have seeded failures"
    failure_id = failures[0]["id"]

    run = await client.post(f"/api/v1/ai/rca/{failure_id}/run", headers=headers)
    assert run.status_code == 200, run.text
    rca = run.json()["data"]
    causes = rca["ai_output"]["causes"]
    assert causes, "RCA should produce ranked causes"
    assert all(c["evidence"] for c in causes), "every cause must cite ≥1 chunk/record"
    # ranked by confidence
    confs = [c["confidence"] for c in causes]
    assert confs == sorted(confs, reverse=True)
    # five-why ladder + fishbone categories for the canvas
    assert len(rca["five_why"]) >= 2
    assert rca["fishbone"]

    # latest fetch returns the same analysis
    got = await client.get(f"/api/v1/ai/rca/{failure_id}", headers=headers)
    assert got.json()["data"]["id"] == rca["id"]


async def test_rca_edit_and_publish_spawns_capa(db, minio, client):
    await seed_run()
    headers = await _login(client)
    tenant_id = await _tenant_id(client, headers)
    await _ingest(client, headers, tenant_id, "P-101 Seal Inspection Report", [
        "Inspection of P-101 seal shows flush plan 52 orifice partially blocked. " * 3])

    p101 = await _equipment_id(client, headers, "P-101")
    failure_id = (await client.get("/api/v1/failures", headers=headers,
                                   params={"equipment_id": p101})).json()["data"][0]["id"]
    rca = (await client.post(f"/api/v1/ai/rca/{failure_id}/run", headers=headers)).json()["data"]

    # human edits: set root cause + corrective actions
    patched = await client.patch(f"/api/v1/ai/rca/analyses/{rca['id']}", headers=headers, json={
        "root_cause_final": "Flush-plan orifice blockage causing dry-running seal faces.",
        "corrective_actions": [{"action": "Convert P-101 flush to API Plan 11 and clean orifice"}]})
    assert patched.status_code == 200 and patched.json()["data"]["status"] == "edited"

    published = await client.post(f"/api/v1/ai/rca/analyses/{rca['id']}/publish", headers=headers,
                                  json={"spawn_work_orders": True})
    assert published.status_code == 200
    assert published.json()["data"]["status"] == "published"

    # a corrective (CAPA) work order was spawned from the RCA
    capa = (await client.get("/api/v1/work-orders", headers=headers,
                             params={"source": "rca"})).json()["data"]
    assert any("CAPA" in w["title"] for w in capa)
