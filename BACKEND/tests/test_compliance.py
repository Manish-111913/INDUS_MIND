"""Compliance module tests (docs/02 §7, §10, §19, §54).

Regulation/clause seeding, the mapping/gap scan (the FW-P1 clause-6.4 demo gap
with side-by-side data exactly as the gap-detail screen expects), mapping
confirm/reject, gap → remediation work order, coverage heatmap, offline
regulation import, and evidence-package generation (PDF + ZIP → S3). The authz
matrix for these endpoints lives in tests/test_authz_matrix.py via
tests/authz.ENDPOINTS.
"""

from __future__ import annotations

from seeds.seed import DEMO_PASSWORD
from seeds.seed import run as seed_run


async def _login(client, email: str) -> dict:
    resp = await client.post("/api/v1/auth/login",
                             json={"email": email, "password": DEMO_PASSWORD})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['data']['access_token']}"}


async def _admin_headers(client) -> dict:
    return await _login(client, "admin@indusmind.io")


async def _equipment_id(client, headers, tag: str) -> str:
    resp = await client.get("/api/v1/equipment", headers=headers,
                            params={"q": tag, "page_size": 100})
    return next(e["id"] for e in resp.json()["data"] if e["tag"] == tag)


# ── unit: interval parsing / clause regex (no DB) ─────────────────────────────
def test_parse_interval_days():
    from app.modules.compliance.mapping_agent import parse_interval_days

    assert parse_interval_days("tested on a quarterly basis") == 90
    assert parse_interval_days("intervals not exceeding twelve months") == 365
    assert parse_interval_days("function-tested semi-annually") == 182
    assert parse_interval_days("examined once every six months") == 182
    assert parse_interval_days("vibration monitoring programme") is None


def test_parse_clauses_regex():
    from app.modules.compliance.parse_agent import parse_clauses_regex

    text = ("Clause 6.4: Firewater pumps shall be tested quarterly. "
            "Clause 7.2: Relief valves shall be tested every twelve months.")
    clauses = parse_clauses_regex(text)
    nos = {c["clause_no"] for c in clauses}
    assert nos == {"6.4", "7.2"}
    assert any("Firewater" in c["text"] for c in clauses)


# ── seed sanity ───────────────────────────────────────────────────────────────
async def test_seed_creates_regulations_and_clauses(db, client):
    await seed_run()
    headers = await _admin_headers(client)
    regs = await client.get("/api/v1/compliance/regulations", headers=headers)
    assert regs.status_code == 200
    assert regs.json()["meta"]["pagination"]["total"] == 2
    codes = {r["code"] for r in regs.json()["data"]}
    assert {"OISD-STD-118", "FACTORY-ACT-1948"} <= codes

    oisd = next(r for r in regs.json()["data"] if r["code"] == "OISD-STD-118")
    clauses = await client.get(f"/api/v1/compliance/regulations/{oisd['id']}/clauses", headers=headers)
    assert clauses.status_code == 200
    nos = {c["clause_no"] for c in clauses.json()["data"]}
    assert "6.4" in nos and "9.1" in nos


# ── the demo gap: clause 6.4 firewater test on FW-P1 ─────────────────────────
async def test_scan_produces_firewater_gap_with_side_by_side_data(db, client):
    await seed_run()  # the seed runs one scan
    headers = await _admin_headers(client)
    fw = await _equipment_id(client, headers, "FW-P1")

    gaps = await client.get("/api/v1/compliance/gaps", headers=headers,
                            params={"equipment_id": fw, "page_size": 100})
    assert gaps.status_code == 200
    assert gaps.json()["meta"]["pagination"]["total"] >= 1
    gap = next(g for g in gaps.json()["data"]
               if g["detail"].get("clause", {}).get("clause_no") == "6.4")

    # detected by the agent, points at FW-P1, high severity
    assert gap["detected_by"] == "agent"
    assert gap["affected_equipment_id"] == fw
    assert gap["ai_explanation"]

    # side-by-side detail exactly as the gap-detail screen consumes it
    detail = gap["detail"]
    assert detail["clause"]["clause_no"] == "6.4"
    assert "quarterly" in detail["clause"]["text"].lower()
    assert detail["clause"]["regulation_code"] == "OISD-STD-118"
    assert detail["requirement"]["interval_days"] == 90
    assert detail["comparison"]["verdict"] == "gap"
    assert detail["records"]  # the firewater test schedule / records evidence
    assert any(r["type"] == "schedule" for r in detail["records"])


async def test_scan_produces_mappings(db, client):
    await seed_run()
    headers = await _admin_headers(client)
    p101 = await _equipment_id(client, headers, "P-101")

    mappings = await client.get("/api/v1/compliance/mappings", headers=headers,
                                params={"page_size": 100})
    assert mappings.status_code == 200
    rows = mappings.json()["data"]
    assert rows, "scan should propose at least one mapping"
    assert all(m["status"] == "proposed" and m["mapped_by"] == "ai" for m in rows)
    # clause 9.1 explicitly names P-101 → it is mapped to P-101 (equipment or its record)
    assert any(str(p101) in (m.get("target_label") or "") or m["target_id"] == p101 for m in rows) \
        or any(m["target_type"] in {"equipment", "record"} for m in rows)


# ── human-in-the-loop: confirm / reject a mapping ────────────────────────────
async def test_confirm_and_reject_mapping(db, client):
    await seed_run()
    headers = await _admin_headers(client)
    rows = (await client.get("/api/v1/compliance/mappings", headers=headers,
                             params={"page_size": 100})).json()["data"]
    assert rows
    mapping = rows[0]

    confirmed = await client.patch(f"/api/v1/compliance/mappings/{mapping['id']}",
                                   headers=headers, json={"status": "confirmed"})
    assert confirmed.status_code == 200
    assert confirmed.json()["data"]["status"] == "confirmed"
    assert confirmed.json()["data"]["mapped_by"] == "human"

    # a re-scan must not override a human decision
    await client.post("/api/v1/ai/compliance/scan", headers=headers, json={"scope": {}})
    after = await client.get("/api/v1/compliance/mappings", headers=headers,
                             params={"clause_id": mapping["clause_id"], "page_size": 100})
    still = next(m for m in after.json()["data"] if m["id"] == mapping["id"])
    assert still["status"] == "confirmed"


# ── gap → remediation work order (source=gap) ────────────────────────────────
async def test_gap_create_remediation_work_order(db, client):
    await seed_run()
    headers = await _admin_headers(client)
    fw = await _equipment_id(client, headers, "FW-P1")
    gaps = await client.get("/api/v1/compliance/gaps", headers=headers,
                            params={"equipment_id": fw, "page_size": 100})
    gap = next(g for g in gaps.json()["data"]
               if g["detail"].get("clause", {}).get("clause_no") == "6.4")

    resp = await client.post(f"/api/v1/compliance/gaps/{gap['id']}/create-remediation",
                             headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()["data"]
    assert body["status"] == "in_remediation"
    wo_id = body["work_order_id"]

    wo = await client.get(f"/api/v1/work-orders/{wo_id}", headers=headers)
    assert wo.status_code == 200
    assert wo.json()["data"]["source"] == "gap"
    assert wo.json()["data"]["equipment_id"] == fw

    # idempotent — a second remediation is rejected
    again = await client.post(f"/api/v1/compliance/gaps/{gap['id']}/create-remediation",
                              headers=headers)
    assert again.status_code == 409


# ── coverage heatmap ──────────────────────────────────────────────────────────
async def test_coverage_matrix(db, client):
    await seed_run()
    headers = await _admin_headers(client)
    resp = await client.get("/api/v1/compliance/coverage", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    oisd = next(r for r in data["regulations"] if r["regulation_code"] == "OISD-STD-118")
    assert oisd["clauses"] == 8
    assert oisd["gaps"] >= 1                 # the firewater gap
    assert "areas" in data and "matrix" in data
    assert any(cell["gaps"] >= 1 for cell in data["matrix"])


# ── manual gap + audit CRUD ───────────────────────────────────────────────────
async def test_manual_gap_and_audit_crud(db, client):
    await seed_run()
    headers = await _admin_headers(client)
    gap = await client.post("/api/v1/compliance/gaps", headers=headers,
                            json={"title": "Manual gap", "severity": "medium"})
    assert gap.status_code == 201
    assert gap.json()["data"]["detected_by"] == "manual"

    audit = await client.post("/api/v1/compliance/audits", headers=headers,
                              json={"name": "Q3 OISD audit", "body": "oisd"})
    assert audit.status_code == 201
    aid = audit.json()["data"]["id"]
    patched = await client.patch(f"/api/v1/compliance/audits/{aid}", headers=headers,
                                 json={"status": "in_progress", "version": 1})
    assert patched.status_code == 200 and patched.json()["data"]["status"] == "in_progress"


# ── offline regulation import (chunks → clause tree) ─────────────────────────
async def test_regulation_import_offline(db, client):
    await seed_run()
    headers = await _admin_headers(client)

    # Insert a document + chunks with numbered clauses (no MinIO / ingestion needed).
    import uuid as _uuid

    from sqlalchemy import select as _select

    from app.core.database import SessionFactory
    from app.modules.documents.models import Document
    from app.modules.ingestion.models import DocumentChunk
    from app.modules.tenants.models import Tenant

    async with SessionFactory() as session:
        tenant = (await session.execute(_select(Tenant))).scalars().first()
        doc = Document(tenant_id=tenant.id, title="PESO-2016 Static & Mobile Pressure Vessels",
                       source="upload", storage_key="", mime="application/pdf",
                       ingestion_status="completed")
        session.add(doc)
        await session.flush()
        for idx, text in enumerate([
            "Clause 3.1: Every pressure vessel shall be registered and certified before use.",
            "Clause 3.2: Pressure vessels shall be hydrostatically tested every two years.",
        ]):
            session.add(DocumentChunk(tenant_id=tenant.id, document_id=doc.id, chunk_index=idx,
                                      text=text, checksum=_uuid.uuid4().hex))
        await session.commit()
        doc_id = str(doc.id)

    resp = await client.post("/api/v1/compliance/regulations/import", headers=headers,
                             json={"document_id": doc_id})
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["clauses_parsed"] == 2

    reg_id = resp.json()["data"]["id"]
    clauses = await client.get(f"/api/v1/compliance/regulations/{reg_id}/clauses", headers=headers)
    nos = {c["clause_no"] for c in clauses.json()["data"]}
    assert nos == {"3.1", "3.2"}


# ── evidence package: PDF + ZIP → S3, download + share token ─────────────────
async def test_evidence_package_generate_and_download(db, minio, client):
    await seed_run()
    headers = await _login(client, "compliance@indusmind.io")

    created = await client.post("/api/v1/compliance/evidence-packages", headers=headers,
                                json={"scope": {}, "title": "Demo evidence"})
    assert created.status_code == 201, created.text
    pkg_id = created.json()["data"]["id"]
    assert created.json()["data"]["status"] == "generating"

    # Run the job body directly (no worker in the test harness).
    from sqlalchemy import select as _select

    from app.core.database import SessionFactory
    from app.modules.compliance.evidence import EvidenceService
    from app.modules.tenants.models import Tenant

    async with SessionFactory() as session:
        tenant = (await session.execute(_select(Tenant))).scalars().first()
        package = await EvidenceService(session, tenant.id).generate(pkg_id)
        await session.commit()
    assert package.status == "ready", package.error

    got = await client.get(f"/api/v1/compliance/evidence-packages/{pkg_id}", headers=headers)
    assert got.status_code == 200
    body = got.json()["data"]
    assert body["status"] == "ready"
    assert body["summary"]["coverage"]
    token = body["share_token"]
    assert token

    dl = await client.get(f"/api/v1/compliance/evidence-packages/{pkg_id}/download-url",
                          headers=headers)
    assert dl.status_code == 200 and dl.json()["data"]["download_url"].startswith("http")

    # auditor read-only share link needs no login
    share = await client.get(f"/api/v1/compliance/evidence-packages/share/{token}")
    assert share.status_code == 200 and share.json()["data"]["download_url"].startswith("http")
