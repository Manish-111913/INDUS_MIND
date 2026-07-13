"""Equipment module tests (docs/02 §7, §23).

Runs against the seeded demo corpus (2 plants, 6 areas, 25 equipment) so the
tree, resolve, summary and history exercise real data.
"""

from __future__ import annotations

from seeds.seed import DEMO_PASSWORD
from seeds.seed import run as seed_run


async def _admin_headers(client) -> dict:
    resp = await client.post("/api/v1/auth/login",
                             json={"email": "admin@indusmind.io", "password": DEMO_PASSWORD})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['data']['access_token']}"}


async def _plant_id(client, headers, code: str = "JAM") -> str:
    plants = (await client.get("/api/v1/plants", headers=headers)).json()["data"]
    return next(p["id"] for p in plants if p["code"] == code)


async def _equipment_by_tag(client, headers, tag: str) -> dict:
    resp = await client.get("/api/v1/equipment", headers=headers,
                            params={"q": tag, "page_size": 100})
    return next(e for e in resp.json()["data"] if e["tag"] == tag)


# ── list / CRUD ───────────────────────────────────────────────────────────────
async def test_list_equipment_returns_seeded_assets(db, client):
    await seed_run()
    headers = await _admin_headers(client)
    resp = await client.get("/api/v1/equipment", headers=headers, params={"page_size": 100})
    assert resp.status_code == 200
    body = resp.json()
    assert body["meta"]["pagination"]["total"] == 25
    tags = {e["tag"] for e in body["data"]}
    assert {"P-101", "C-3", "V-230", "TF-2", "FW-P1"} <= tags


async def test_create_update_delete_equipment(db, client):
    await seed_run()
    headers = await _admin_headers(client)
    plant_id = await _plant_id(client, headers)

    created = await client.post("/api/v1/equipment", headers=headers, json={
        "plant_id": plant_id, "tag": "P-999", "name": "Test Pump", "criticality": "B",
        "status": "operational", "specs": {"power_kw": 55}})
    assert created.status_code == 201, created.text
    eq = created.json()["data"]
    assert eq["tag"] == "P-999" and eq["version"] == 1

    patched = await client.patch(f"/api/v1/equipment/{eq['id']}", headers=headers,
                                 json={"status": "maintenance", "version": 1})
    assert patched.status_code == 200
    assert patched.json()["data"]["status"] == "maintenance"

    # stale version → 409
    stale = await client.patch(f"/api/v1/equipment/{eq['id']}", headers=headers,
                               json={"status": "down", "version": 1})
    assert stale.status_code == 409

    deleted = await client.delete(f"/api/v1/equipment/{eq['id']}", headers=headers)
    assert deleted.status_code == 200
    assert (await client.get(f"/api/v1/equipment/{eq['id']}", headers=headers)).status_code == 404


async def test_create_rejects_unknown_lookup_values(db, client):
    await seed_run()
    headers = await _admin_headers(client)
    plant_id = await _plant_id(client, headers)
    resp = await client.post("/api/v1/equipment", headers=headers, json={
        "plant_id": plant_id, "tag": "BAD-1", "name": "Bad", "criticality": "Z", "status": "flying"})
    assert resp.status_code == 422
    fields = resp.json()["error"]["field_errors"]
    assert "criticality" in fields and "status" in fields


async def test_list_filters(db, client):
    await seed_run()
    headers = await _admin_headers(client)
    crit_a = await client.get("/api/v1/equipment", headers=headers,
                              params={"criticality": "A", "page_size": 100})
    assert crit_a.status_code == 200
    assert all(e["criticality"] == "A" for e in crit_a.json()["data"])
    assert crit_a.json()["meta"]["pagination"]["total"] >= 5


# ── tree (recursive CTE + cache invalidation) ─────────────────────────────────
async def test_tree_nested_hierarchy(db, client):
    await seed_run()
    headers = await _admin_headers(client)
    plant_id = await _plant_id(client, headers)
    tree = (await client.get("/api/v1/equipment/tree", headers=headers,
                             params={"plant_id": plant_id})).json()["data"]

    areas = {a["code"]: a for a in tree["areas"]}
    assert {"CDU", "UTIL", "TANK"} <= set(areas)
    cdu_tags = {e["tag"] for e in areas["CDU"]["equipment"]}
    assert {"P-101", "C-3", "V-230"} <= cdu_tags

    # M-201 is a child of P-201 (parent hierarchy) in UTIL.
    p201 = next(e for e in areas["UTIL"]["equipment"] if e["tag"] == "P-201")
    assert any(c["tag"] == "M-201" for c in p201["children"])


async def test_tree_cache_invalidated_on_create(db, client):
    await seed_run()
    headers = await _admin_headers(client)
    plant_id = await _plant_id(client, headers)

    # Prime the cache.
    await client.get("/api/v1/equipment/tree", headers=headers, params={"plant_id": plant_id})
    # Create new equipment → publishes event → cache invalidated.
    await client.post("/api/v1/equipment", headers=headers, json={
        "plant_id": plant_id, "tag": "NEW-CDU-1", "name": "Fresh Unit", "criticality": "C"})
    tree = (await client.get("/api/v1/equipment/tree", headers=headers,
                             params={"plant_id": plant_id})).json()["data"]
    all_tags = {e["tag"] for a in tree["areas"] for e in a["equipment"]} | \
               {e["tag"] for e in tree["unassigned"]}
    assert "NEW-CDU-1" in all_tags  # would be absent if the stale cache were served


# ── resolve (fuzzy pg_trgm) ───────────────────────────────────────────────────
async def test_resolve_fuzzy_tag(db, client):
    await seed_run()
    headers = await _admin_headers(client)

    for query in ("P101", "p-101", "P-101"):
        resp = await client.get("/api/v1/equipment/resolve", headers=headers, params={"tag": query})
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["best"]["tag"] == "P-101", f"query={query}"

    # name-driven fuzzy match
    fw = await client.get("/api/v1/equipment/resolve", headers=headers, params={"tag": "Firewater"})
    assert "FW-P1" in {m["tag"] for m in fw.json()["data"]["matches"]}


# ── 360° summary / history / metrics ──────────────────────────────────────────
async def test_summary_history_metrics(db, client):
    await seed_run()
    headers = await _admin_headers(client)
    p101 = await _equipment_by_tag(client, headers, "P-101")

    summary = (await client.get(f"/api/v1/equipment/{p101['id']}/summary",
                                headers=headers)).json()["data"]
    assert summary["tag"] == "P-101"
    assert summary["type"] == "Pump"
    assert summary["plant"]["code"] == "JAM"
    assert summary["area"]["code"] == "CDU"

    # No audit rows yet for the seeded row → empty timeline; a PATCH creates one.
    assert (await client.get(f"/api/v1/equipment/{p101['id']}/history",
                             headers=headers)).json()["data"] == []
    await client.patch(f"/api/v1/equipment/{p101['id']}", headers=headers,
                       json={"health_score": 91, "version": p101["version"]})
    history = (await client.get(f"/api/v1/equipment/{p101['id']}/history",
                                headers=headers)).json()["data"]
    assert any(e["type"] == "equipment.update" and e["source"] == "audit" for e in history)

    metrics = (await client.get(f"/api/v1/equipment/{p101['id']}/metrics",
                                headers=headers)).json()["data"]
    assert metrics["health_score"] == 91.0
    assert metrics["mtbf_hours"] is None  # placeholder until maintenance module


# ── bulk CSV import with row-level report ─────────────────────────────────────
async def test_bulk_import_row_level_report(db, client):
    await seed_run()
    headers = await _admin_headers(client)
    csv_body = (
        "tag,name,type,criticality,status,plant_code,area_code,manufacturer\n"
        "IMP-1,Imported Pump,pump,B,operational,JAM,CDU,KSB\n"
        "P-101,Duplicate,pump,A,operational,JAM,CDU,KSB\n"
        ",Missing Tag Name,pump,C,operational,JAM,CDU,KSB\n"
    )
    resp = await client.post(
        "/api/v1/equipment/import", headers=headers,
        files={"file": ("assets.csv", csv_body.encode(), "text/csv")})
    assert resp.status_code == 200, resp.text
    report = resp.json()["data"]
    assert report["total"] == 3
    assert report["created"] == 1
    assert report["failed"] == 2
    by_row = {r["row"]: r for r in report["rows"]}
    assert by_row[1]["status"] == "created" and by_row[1]["tag"] == "IMP-1"
    assert by_row[2]["status"] == "error" and any("already exists" in e for e in by_row[2]["errors"])
    assert by_row[3]["status"] == "error"

    # The imported row is now retrievable.
    listed = await client.get("/api/v1/equipment", headers=headers, params={"q": "IMP-1"})
    assert "IMP-1" in {e["tag"] for e in listed.json()["data"]}
