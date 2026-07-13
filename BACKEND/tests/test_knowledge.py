"""Entity extraction + knowledge-graph tests (docs/02 §9, §10 6–7, §26).

Extraction runs against MinIO (real PDFs). Graph tests additionally need Neo4j
and skip cleanly without it. Uses the deterministic/mock LLM fallback, so the
regex/gazetteer pass carries extraction offline.
"""

from __future__ import annotations

import hashlib

import httpx

from app.core.database import SessionFactory
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


async def _ingest(client, headers, tenant_id: str, title: str, paras: list[str]) -> str:
    pdf = generate_pdf(title, paras)
    up = await client.post("/api/v1/documents/upload-url", headers=headers, json={
        "filename": f"{title[:10]}.pdf", "mime": "application/pdf", "size": len(pdf), "title": title})
    d = up.json()["data"]
    async with httpx.AsyncClient(timeout=30) as s3:
        put = await s3.put(d["presigned_url"], content=pdf, headers={"Content-Type": "application/pdf"})
        assert put.status_code in (200, 204)
    conf = await client.post(f"/api/v1/documents/{d['document_id']}/confirm", headers=headers,
                             json={"checksum": hashlib.sha256(pdf).hexdigest(), "meta": {}})
    assert conf.status_code == 200, conf.text
    async with SessionFactory() as session:
        from app.modules.ingestion.pipeline import run_pipeline
        await run_pipeline(session, tenant_id, d["document_id"])
        await session.commit()
    return d["document_id"]


# ── AI config + prompts (no external services) ────────────────────────────────
async def test_ai_config_resolves(db, client):
    await seed_run()
    from app.core.llm import clear_config_cache, resolve_config

    clear_config_cache()
    async with SessionFactory() as session:
        cfg = await resolve_config(session, None, "extraction")
    assert cfg.confidence_threshold == 0.6
    assert cfg.provider == "anthropic"


async def test_prompt_render_whitelist(db, client):
    await seed_run()
    from app.core.exceptions import ValidationFailed
    from app.modules.ai.service import PromptService

    async with SessionFactory() as session:
        svc = PromptService(session)
        rendered = await svc.render(None, "extract.entities", {"text": "P-101 VIBRATION HIGH"})
        assert "P-101 VIBRATION HIGH" in rendered
        try:
            await svc.render(None, "extract.entities", {"unknown_var": "x"})
            raise AssertionError("expected ValidationFailed")
        except ValidationFailed:
            pass


# ── extraction ────────────────────────────────────────────────────────────────
async def test_extraction_finds_and_links_entities(db, minio, client):
    await seed_run()
    headers = await _headers(client)
    tenant_id = await _tenant_id(client, headers)
    doc_id = await _ingest(client, headers, tenant_id, "Pump P-101 Manual", [
        "Bonnet bolt torque for P-101 is 210 Nm per OISD-STD-118 clause 6.4. "
        "Seal replaced by A. Technician on 2026-07-12. Flow rated 450 m3/h. " * 4])

    entities = (await client.get(f"/api/v1/documents/{doc_id}/entities",
                                 headers=headers)).json()["data"]
    by_type: dict[str, list] = {}
    for e in entities:
        by_type.setdefault(e["entity_type"], []).append(e)

    # equipment tag P-101 resolved + linked to the equipment registry
    tags = by_type.get("equipment_tag", [])
    p101 = next((e for e in tags if e["normalized_value"] == "P-101"), None)
    assert p101 is not None and p101["linked_record_id"] is not None
    # clause reference captured
    assert any("OISD-STD-118" in e["value"] for e in by_type.get("regulation_ref", []))
    # date + parameter picked up by the gazetteer pass
    assert any(e["value"] == "2026-07-12" for e in by_type.get("date", []))
    assert by_type.get("parameter")


async def test_entity_review_confirm_and_correct(db, minio, client):
    await seed_run()
    headers = await _headers(client)
    tenant_id = await _tenant_id(client, headers)
    doc_id = await _ingest(client, headers, tenant_id, "WO-2041 P-101", [
        "WO-2041 corrective work on P-101, seal leak resolved. " * 6])
    entities = (await client.get(f"/api/v1/documents/{doc_id}/entities",
                                 headers=headers)).json()["data"]
    ent = next(e for e in entities if e["entity_type"] == "equipment_tag")

    confirmed = await client.patch(f"/api/v1/entities/{ent['id']}", headers=headers,
                                   json={"status": "confirmed", "version": ent["version"]})
    assert confirmed.status_code == 200 and confirmed.json()["data"]["status"] == "confirmed"

    # correct re-links to the resolved equipment
    corrected = await client.patch(f"/api/v1/entities/{ent['id']}", headers=headers,
                                   json={"status": "corrected", "value": "C-3",
                                         "version": confirmed.json()["data"]["version"]})
    assert corrected.status_code == 200
    assert corrected.json()["data"]["normalized_value"] == "C-3"


# ── knowledge graph (needs Neo4j) ─────────────────────────────────────────────
async def test_graph_stats_neighbors_query_rebuild(db, minio, neo4j, client):
    await seed_run()
    headers = await _headers(client)
    tenant_id = await _tenant_id(client, headers)
    await _ingest(client, headers, tenant_id, "Centrifugal Pump P-101 — OEM Manual", [
        "P-101 bonnet bolt torque 210 Nm. Mechanical seal John Crane 5610. " * 4])
    await _ingest(client, headers, tenant_id, "Work Order WO-2041 — P-101 Seal", [
        "WO-2041 corrective work on P-101, replaced seal. " * 4])
    await _ingest(client, headers, tenant_id, "OISD-STD-118 Clause Excerpts", [
        "Clause 9.1: rotating equipment such as pump P-101 shall have vibration monitoring "
        "per OISD-STD-118 9.1. " * 3])

    # stats show nodes + edges
    stats = (await client.get("/api/v1/graph/stats", headers=headers)).json()["data"]
    assert stats["total_nodes"] >= 4
    assert "Document" in stats["nodes_by_label"] and "Equipment" in stats["nodes_by_label"]
    assert stats["edges_by_type"].get("MENTIONS", 0) >= 3

    # locate the P-101 equipment node
    search = (await client.get("/api/v1/graph/search", headers=headers,
                               params={"q": "P-101"})).json()["data"]
    equip = next(n for n in search if "Equipment" in n["labels"])

    # neighbors include the documents that mention it
    nbrs = (await client.get(f"/api/v1/graph/nodes/{equip['id']}/neighbors", headers=headers,
                             params={"depth": 2})).json()["data"]
    doc_titles = [n["properties"].get("title", "") for n in nbrs if "Document" in n["labels"]]
    assert any("Manual" in t for t in doc_titles)
    assert any("WO-2041" in t for t in doc_titles)
    assert any("OISD" in t for t in doc_titles)

    # constrained DSL query: Equipment P-101 -MENTIONS- Document
    q = await client.post("/api/v1/graph/query", headers=headers, json={
        "start_type": "Equipment", "start_key": "P-101", "edge_types": ["MENTIONS"],
        "node_types": ["Document"], "depth": 1})
    assert q.status_code == 200 and len(q.json()["data"]) >= 3

    # raw-type injection rejected by the whitelist
    bad = await client.post("/api/v1/graph/query", headers=headers, json={
        "start_type": "Equipment", "edge_types": ["DROP"], "node_types": []})
    assert bad.status_code == 422

    # admin rebuild replays from Postgres
    rebuilt = await client.post("/api/v1/graph/rebuild", headers=headers)
    assert rebuilt.status_code == 200 and rebuilt.json()["data"]["total_nodes"] >= 4
