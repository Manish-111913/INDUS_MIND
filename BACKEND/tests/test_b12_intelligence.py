"""B12 tests — notifications, quality, lessons, dashboards, analytics (docs/02 §20-22, §34-36).

Covers the verify criteria: each role's /dashboards/config + widget data return
live numbers from seeded ops data; a WO assignment produces a notification; the
seeded 'monsoon seal failure' lesson emerges and publishes; NCR trends and
config-driven analytics reports run over the seeded data.
"""

from __future__ import annotations

import pytest

from seeds.seed import DEMO_PASSWORD
from seeds.seed import run as seed_run

ROLES = {
    "admin@indusmind.io": "Admin",
    "manager@indusmind.io": "Plant Manager",
    "engineer@indusmind.io": "Maintenance Engineer",
    "technician@indusmind.io": "Field Technician",
    "compliance@indusmind.io": "Compliance Officer",
}


async def _login(client, email: str) -> dict:
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['data']['access_token']}"}


async def _equipment_id(client, headers, tag: str) -> str:
    resp = await client.get("/api/v1/equipment", headers=headers, params={"q": tag, "page_size": 100})
    return next(e["id"] for e in resp.json()["data"] if e["tag"] == tag)


async def _user_id(client, headers, email: str) -> str:
    resp = await client.get("/api/v1/users", headers=headers, params={"page_size": 100})
    return next(u["id"] for u in resp.json()["data"] if u["email"] == email)


# ── notifications: WO assignment → notification for the assignee ──────────────
async def test_wo_assignment_creates_notification(db, client):
    await seed_run()
    admin = await _login(client, "admin@indusmind.io")
    p101 = await _equipment_id(client, admin, "P-101")
    tech_id = await _user_id(client, admin, "technician@indusmind.io")

    created = await client.post("/api/v1/work-orders", headers=admin, json={
        "title": "Seal swap P-101", "equipment_id": p101, "type": "corrective", "priority": "high"})
    wo = created.json()["data"]
    assigned = await client.post(f"/api/v1/work-orders/{wo['id']}/assign", headers=admin,
                                 json={"assignee_id": tech_id})
    assert assigned.status_code == 200

    tech = await _login(client, "technician@indusmind.io")
    notifs = await client.get("/api/v1/notifications", headers=tech, params={"unread": True})
    assert notifs.status_code == 200
    data = notifs.json()["data"]
    assert data, "assignee should receive a notification"
    wo_notif = next(n for n in data if n["category"] == "wo_assigned")
    assert wo_notif["entity_type"] is None or wo_notif["priority"] == "high"
    assert "in_app" in wo_notif["channels_sent"]  # WS notification.new was published
    assert notifs.json()["meta"]["unread_count"] >= 1


async def test_notification_mark_read_and_preferences(db, client):
    await seed_run()
    admin = await _login(client, "admin@indusmind.io")
    tech_id = await _user_id(client, admin, "technician@indusmind.io")
    p101 = await _equipment_id(client, admin, "P-101")
    wo = (await client.post("/api/v1/work-orders", headers=admin, json={
        "title": "x", "equipment_id": p101, "type": "corrective", "priority": "high"})).json()["data"]
    await client.post(f"/api/v1/work-orders/{wo['id']}/assign", headers=admin,
                      json={"assignee_id": tech_id})

    tech = await _login(client, "technician@indusmind.io")
    marked = await client.post("/api/v1/notifications/mark-read", headers=tech, json={"all": True})
    assert marked.status_code == 200 and marked.json()["data"]["marked_read"] >= 1

    prefs = await client.get("/api/v1/notifications/preferences", headers=tech)
    assert prefs.status_code == 200
    matrix = prefs.json()["data"]["preferences"]
    assert any(row["category"] == "wo_assigned" for row in matrix)
    upd = await client.put("/api/v1/notifications/preferences", headers=tech, json={
        "preferences": [{"category": "wo_assigned", "channel": "email", "enabled": False}]})
    assert upd.status_code == 200
    wo_row = next(r for r in upd.json()["data"]["preferences"] if r["category"] == "wo_assigned")
    assert wo_row["channels"]["email"] is False


async def test_broadcast_requires_permission(db, client):
    await seed_run()
    admin = await _login(client, "admin@indusmind.io")
    resp = await client.post("/api/v1/notifications/broadcast", headers=admin, json={
        "title": "Planned shutdown Sunday", "category": "system", "priority": "high"})
    assert resp.status_code == 200
    assert resp.json()["data"]["delivered"] >= 1

    tech = await _login(client, "technician@indusmind.io")
    denied = await client.post("/api/v1/notifications/broadcast", headers=tech,
                               json={"title": "nope"})
    assert denied.status_code == 403


# ── quality: NCR CRUD + trends ────────────────────────────────────────────────
async def test_quality_ncr_crud_and_trends(db, client):
    await seed_run()
    admin = await _login(client, "admin@indusmind.io")

    ncrs = await client.get("/api/v1/quality/ncrs", headers=admin, params={"page_size": 100})
    assert ncrs.status_code == 200
    assert ncrs.json()["meta"]["pagination"]["total"] == 9  # seeded

    created = await client.post("/api/v1/quality/ncrs", headers=admin, json={
        "description": "Gasket blow-out on manifold", "severity": "major", "line": "CDU"})
    assert created.status_code == 201
    assert created.json()["data"]["ncr_number"].startswith("NCR-")

    trends = await client.get("/api/v1/quality/ncrs/trends", headers=admin)
    assert trends.status_code == 200
    t = trends.json()["data"]
    assert t["total"] >= 9
    assert t["defect_pareto"] and t["defect_pareto"][0]["count"] >= 1
    # pareto is descending + cumulative reaches ~100
    assert t["defect_pareto"][-1]["cumulative_pct"] == pytest.approx(100.0, abs=0.5)
    assert t["deviation_rate_by_area"]  # deviation rate by line/area computed


# ── lessons: the seeded monsoon pattern + publish ─────────────────────────────
async def test_monsoon_lesson_emerges_and_publishes(db, client):
    await seed_run()  # the seed runs the lessons agent
    admin = await _login(client, "admin@indusmind.io")

    lessons = await client.get("/api/v1/lessons", headers=admin, params={"page_size": 100})
    assert lessons.status_code == 200
    rows = lessons.json()["data"]
    monsoon = next((row for row in rows if "monsoon" in row["title"].lower()
                    and "seal" in row["title"].lower()), None)
    assert monsoon is not None, "the seeded monsoon seal-failure pattern should emerge"
    assert monsoon["status"] == "candidate" and monsoon["source"] == "agent"
    assert len(monsoon["affected_equipment_ids"]) >= 2   # spans multiple pumps
    assert monsoon["evidence"] and monsoon["confidence"] is not None

    published = await client.post(f"/api/v1/lessons/{monsoon['id']}/publish", headers=admin)
    assert published.status_code == 200
    assert published.json()["data"]["status"] == "published"

    # a manager (subscriber) receives the broadcast
    manager = await _login(client, "manager@indusmind.io")
    notifs = await client.get("/api/v1/notifications", headers=manager,
                              params={"category": "mention"})
    assert any("lesson" in (n["title"] or "").lower() for n in notifs.json()["data"])


async def test_lessons_detect_is_idempotent(db, client):
    await seed_run()
    admin = await _login(client, "admin@indusmind.io")
    before = (await client.get("/api/v1/lessons", headers=admin,
                               params={"page_size": 100})).json()["meta"]["pagination"]["total"]
    rerun = await client.post("/api/v1/ai/lessons/detect", headers=admin, json={"scope": {}})
    assert rerun.status_code == 200 and rerun.json()["data"]["created"] == 0  # already on record
    after = (await client.get("/api/v1/lessons", headers=admin,
                              params={"page_size": 100})).json()["meta"]["pagination"]["total"]
    assert after == before


# ── dashboards: per-role config + live widget data ────────────────────────────
async def test_each_role_dashboard_config_and_live_widget_data(db, client):
    await seed_run()
    for email, role in ROLES.items():
        headers = await _login(client, email)
        cfg = await client.get("/api/v1/dashboards/config", headers=headers)
        assert cfg.status_code == 200, f"{role}: {cfg.text}"
        layout = cfg.json()["data"]["layout"]
        assert layout, f"{role} should have a resolved dashboard layout"

        # every widget in the layout returns live data
        for item in layout:
            key = item["widget_key"]
            resp = await client.get(f"/api/v1/dashboards/widgets/{key}/data", headers=headers,
                                    params=item.get("params", {}))
            assert resp.status_code == 200, f"{role}/{key}: {resp.text}"
            assert resp.json()["data"]["data"] is not None


async def test_widget_data_is_live_and_cached(db, client):
    await seed_run()
    eng = await _login(client, "engineer@indusmind.io")

    mtbf = await client.get("/api/v1/dashboards/widgets/kpi.mtbf/data", headers=eng)
    assert mtbf.status_code == 200
    assert mtbf.json()["data"]["cached"] is False
    # second call hits the Redis cache
    again = await client.get("/api/v1/dashboards/widgets/kpi.mtbf/data", headers=eng)
    assert again.json()["data"]["cached"] is True

    pareto = await client.get("/api/v1/dashboards/widgets/chart.failure_pareto/data", headers=eng)
    assert pareto.json()["data"]["data"]["series"], "failure pareto should have live series"

    gaps = await client.get("/api/v1/dashboards/widgets/kpi.active_gaps/data", headers=eng)
    assert gaps.json()["data"]["data"]["value"] >= 1  # the seeded firewater gap


async def test_widget_permission_filtering(db, client):
    await seed_run()
    tech = await _login(client, "technician@indusmind.io")
    # technician lacks ai.config → llm spend widget is not visible and its data is denied
    widgets = await client.get("/api/v1/dashboards/widgets", headers=tech)
    keys = {w["key"] for w in widgets.json()["data"]}
    assert "chart.llm_spend" not in keys
    denied = await client.get("/api/v1/dashboards/widgets/chart.llm_spend/data", headers=tech)
    assert denied.status_code == 403


# ── analytics: config-driven reports ──────────────────────────────────────────
async def test_analytics_reports_run_over_seeded_data(db, client):
    await seed_run()
    admin = await _login(client, "admin@indusmind.io")

    reports = await client.get("/api/v1/analytics/reports", headers=admin)
    assert reports.status_code == 200
    by_key = {r["key"]: r for r in reports.json()["data"]}
    assert {"downtime_by_area", "mtbf_by_class", "compliance_gap_aging",
            "knowledge_coverage"} <= set(by_key)

    run = await client.post(f"/api/v1/analytics/reports/{by_key['downtime_by_area']['id']}/run",
                            headers=admin, json={"params": {}})
    assert run.status_code == 200, run.text
    body = run.json()["data"]
    assert "area" in body["columns"] and "downtime_hours" in body["columns"]
    assert body["row_count"] >= 1
    assert body["charts"].get("type") == "bar"

    aging = await client.post(f"/api/v1/analytics/reports/{by_key['compliance_gap_aging']['id']}/run",
                              headers=admin, json={"params": {}})
    assert aging.status_code == 200 and aging.json()["data"]["row_count"] >= 1


async def test_analytics_kpis_endpoint(db, client):
    await seed_run()
    admin = await _login(client, "admin@indusmind.io")
    resp = await client.get("/api/v1/analytics/kpis", headers=admin,
                            params={"keys": "mtbf,mttr,active_gaps"})
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert "mtbf" in data and "active_gaps" in data
    assert data["active_gaps"]["value"] >= 1


async def test_analytics_export_to_s3(db, minio, client):
    await seed_run()
    admin = await _login(client, "admin@indusmind.io")
    reports = await client.get("/api/v1/analytics/reports", headers=admin)
    rid = next(r["id"] for r in reports.json()["data"] if r["key"] == "downtime_by_area")

    export = await client.post(f"/api/v1/analytics/reports/{rid}/export", headers=admin,
                               json={"format": "xlsx"})
    assert export.status_code == 200, export.text
    body = export.json()["data"]
    assert body["format"] == "xlsx" and body["download_url"].startswith("http")


async def test_report_sql_is_select_only(db, client):
    """Defence-in-depth: the runner rejects non-SELECT templates."""
    from app.core.exceptions import ValidationFailed
    from app.modules.analytics.service import _validate_sql

    _validate_sql("SELECT 1")
    with pytest.raises(ValidationFailed):
        _validate_sql("DELETE FROM work_orders")
    with pytest.raises(ValidationFailed):
        _validate_sql("SELECT 1; DROP TABLE users")
