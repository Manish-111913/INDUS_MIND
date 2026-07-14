"""Maintenance module tests (docs/02 §7, §18, §54).

State-machine unit tests + lifecycle/integration tests against the seeded corpus
(30 work orders, 8 failures, P-101 seal story, FW-P1 overdue). The authz matrix
for these endpoints lives in tests/test_authz_matrix.py via tests/authz.ENDPOINTS.
"""

from __future__ import annotations

import pytest

from app.modules.maintenance import state_machine as sm
from seeds.seed import DEMO_PASSWORD
from seeds.seed import run as seed_run


# ── state machine (pure unit — no DB) ─────────────────────────────────────────
def test_legal_transitions():
    assert sm.can_transition(sm.OPEN, sm.IN_PROGRESS)
    assert sm.can_transition(sm.IN_PROGRESS, sm.ON_HOLD)
    assert sm.can_transition(sm.IN_PROGRESS, sm.REVIEW)
    assert sm.can_transition(sm.ON_HOLD, sm.IN_PROGRESS)
    assert sm.can_transition(sm.REVIEW, sm.CLOSED)
    assert sm.can_transition(sm.IN_PROGRESS, sm.CLOSED)


def test_illegal_transitions():
    assert not sm.can_transition(sm.OPEN, sm.CLOSED)      # must progress first
    assert not sm.can_transition(sm.OPEN, sm.REVIEW)
    assert not sm.can_transition(sm.CLOSED, sm.IN_PROGRESS)  # terminal
    assert not sm.can_transition(sm.CANCELLED, sm.OPEN)      # terminal


def test_validate_transition_raises():
    from app.core.exceptions import ValidationFailed

    with pytest.raises(ValidationFailed):
        sm.validate_transition(sm.OPEN, sm.CLOSED)
    with pytest.raises(ValidationFailed):
        sm.validate_transition(sm.OPEN, sm.OPEN)          # already in state
    with pytest.raises(ValidationFailed):
        sm.validate_transition(sm.OPEN, "bogus")
    sm.validate_transition(sm.OPEN, sm.IN_PROGRESS)       # legal → no raise


# ── helpers ───────────────────────────────────────────────────────────────────
async def _admin_headers(client) -> dict:
    resp = await client.post("/api/v1/auth/login",
                             json={"email": "admin@indusmind.io", "password": DEMO_PASSWORD})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['data']['access_token']}"}


async def _login(client, email: str) -> dict:
    resp = await client.post("/api/v1/auth/login",
                             json={"email": email, "password": DEMO_PASSWORD})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['data']['access_token']}"}


async def _equipment_id(client, headers, tag: str) -> str:
    resp = await client.get("/api/v1/equipment", headers=headers,
                            params={"q": tag, "page_size": 100})
    return next(e["id"] for e in resp.json()["data"] if e["tag"] == tag)


async def _lookup_id(client, headers, category: str, code: str) -> str:
    resp = await client.get(f"/api/v1/lookups/{category}", headers=headers)
    return next(row["id"] for row in resp.json()["data"] if row["code"] == code)


# ── seed sanity ───────────────────────────────────────────────────────────────
async def test_seed_populates_work_orders_and_failures(db, client):
    await seed_run()
    headers = await _admin_headers(client)
    wos = await client.get("/api/v1/work-orders", headers=headers, params={"page_size": 5})
    assert wos.status_code == 200
    assert wos.json()["meta"]["pagination"]["total"] == 30
    failures = await client.get("/api/v1/failures", headers=headers)
    assert failures.json()["meta"]["pagination"]["total"] == 8


async def test_list_filters(db, client):
    await seed_run()
    headers = await _admin_headers(client)
    p101 = await _equipment_id(client, headers, "P-101")

    by_equipment = await client.get("/api/v1/work-orders", headers=headers,
                                    params={"equipment_id": p101, "page_size": 100})
    assert by_equipment.status_code == 200
    assert by_equipment.json()["meta"]["pagination"]["total"] >= 3  # seal story WOs

    closed = await client.get("/api/v1/work-orders", headers=headers,
                              params={"status": "closed", "page_size": 100})
    assert all(w["status"] == "closed" for w in closed.json()["data"])

    critical = await client.get("/api/v1/work-orders", headers=headers,
                                params={"priority": "critical", "page_size": 100})
    assert all(w["priority"] == "critical" for w in critical.json()["data"])

    schedule_src = await client.get("/api/v1/work-orders", headers=headers,
                                    params={"source": "schedule"})
    assert schedule_src.status_code == 200


# ── lifecycle: create → assign → transition → close (+failure) ───────────────
async def test_work_order_lifecycle(db, client):
    await seed_run()
    headers = await _admin_headers(client)
    p101 = await _equipment_id(client, headers, "P-101")

    created = await client.post("/api/v1/work-orders", headers=headers, json={
        "title": "Replace P-101 mechanical seal", "equipment_id": p101,
        "type": "corrective", "priority": "high"})
    assert created.status_code == 201, created.text
    wo = created.json()["data"]
    assert wo["status"] == "open" and wo["wo_number"].startswith("WO-")

    # assign
    tech = await _login(client, "technician@indusmind.io")  # noqa: F841 — ensures user exists
    users = await client.get("/api/v1/users", headers=headers, params={"page_size": 100})
    tech_id = next(u["id"] for u in users.json()["data"] if u["email"] == "technician@indusmind.io")
    assigned = await client.post(f"/api/v1/work-orders/{wo['id']}/assign", headers=headers,
                                 json={"assignee_id": tech_id})
    assert assigned.status_code == 200
    assert assigned.json()["data"]["assignee_id"] == tech_id

    # illegal transition open → closed via /transition
    bad = await client.post(f"/api/v1/work-orders/{wo['id']}/transition", headers=headers,
                            json={"status": "closed"})
    assert bad.status_code == 422
    assert bad.json()["error"]["code"] in {"ILLEGAL_TRANSITION", "USE_CLOSE_ENDPOINT"}

    # legal: open → in_progress (stamps started_at) → review
    t1 = await client.post(f"/api/v1/work-orders/{wo['id']}/transition", headers=headers,
                           json={"status": "in_progress"})
    assert t1.status_code == 200 and t1.json()["data"]["started_at"] is not None
    t2 = await client.post(f"/api/v1/work-orders/{wo['id']}/transition", headers=headers,
                           json={"status": "review"})
    assert t2.status_code == 200

    # illegal jump review → open
    bad2 = await client.post(f"/api/v1/work-orders/{wo['id']}/transition", headers=headers,
                             json={"status": "open"})
    assert bad2.status_code == 422

    # close with a failure code → creates + links a failure record
    seal_leak = await _lookup_id(client, headers, "failure_codes", "seal_leak")
    leakage = await _lookup_id(client, headers, "failure_modes", "leakage")
    closed = await client.post(f"/api/v1/work-orders/{wo['id']}/close", headers=headers, json={
        "failure_code_id": seal_leak, "failure_mode_id": leakage,
        "closure_notes": "Replaced mechanical seal and flush plan lines.",
        "labor_hours": 4.5, "downtime_minutes": 180,
        "parts": [{"part_no": "SEAL-240", "name": "Cartridge seal", "qty": 1, "cost": 800}]})
    assert closed.status_code == 200, closed.text
    body = closed.json()["data"]
    assert body["status"] == "closed" and body["failure_id"] is not None
    assert body["closure_notes"].startswith("Replaced")

    # the new failure is queryable + linked back
    failures = await client.get("/api/v1/failures", headers=headers,
                                params={"equipment_id": p101, "page_size": 100})
    linked = [f for f in failures.json()["data"] if f["work_order_id"] == wo["id"]]
    assert len(linked) == 1

    # cannot re-close / edit a terminal WO
    reclose = await client.post(f"/api/v1/work-orders/{wo['id']}/close", headers=headers,
                                json={"closure_notes": "again"})
    assert reclose.status_code == 422


async def test_close_rejects_unknown_failure_code(db, client):
    await seed_run()
    headers = await _admin_headers(client)
    created = await client.post("/api/v1/work-orders", headers=headers, json={
        "title": "Generic job", "type": "preventive", "priority": "low"})
    wo = created.json()["data"]
    await client.post(f"/api/v1/work-orders/{wo['id']}/transition", headers=headers,
                      json={"status": "in_progress"})
    bad = await client.post(f"/api/v1/work-orders/{wo['id']}/close", headers=headers, json={
        "failure_code_id": "00000000-0000-0000-0000-000000000000",
        "closure_notes": "x"})
    assert bad.status_code == 422
    assert bad.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_create_rejects_unknown_type(db, client):
    await seed_run()
    headers = await _admin_headers(client)
    bad = await client.post("/api/v1/work-orders", headers=headers, json={
        "title": "Bad", "type": "not_a_type", "priority": "low"})
    assert bad.status_code == 422
    assert "type" in bad.json()["error"].get("field_errors", {})


# ── metrics (real SQL over seeded data) ───────────────────────────────────────
async def test_metrics_are_real_numbers(db, client):
    await seed_run()
    headers = await _admin_headers(client)
    resp = await client.get("/api/v1/maintenance/metrics", headers=headers)
    assert resp.status_code == 200
    m = resp.json()["data"]
    assert m["mttr_hours"] is not None and m["mttr_hours"] > 0   # closed corrective WOs exist
    assert m["failures"] == 8
    assert m["pm_compliance"] is not None                        # PM WOs exist
    assert m["open_work_orders"] >= 1 and m["overdue_work_orders"] >= 1  # FW-P1 overdue

    p101 = await _equipment_id(client, headers, "P-101")
    scoped = await client.get("/api/v1/maintenance/metrics", headers=headers,
                              params={"equipment_id": p101})
    assert scoped.json()["data"]["failures"] == 3               # P-101 seal story


# ── schedules + optimize + apply ──────────────────────────────────────────────
async def test_schedule_crud_and_optimize(db, client):
    await seed_run()
    headers = await _admin_headers(client)
    p101 = await _equipment_id(client, headers, "P-101")

    created = await client.post("/api/v1/maintenance/schedules", headers=headers, json={
        "equipment_id": p101, "name": "Seal check", "frequency_type": "time",
        "interval_days": 120, "task_template": {"title": "Seal check", "priority": "high"}})
    assert created.status_code == 201, created.text
    sched = created.json()["data"]

    patched = await client.patch(f"/api/v1/maintenance/schedules/{sched['id']}", headers=headers,
                                 json={"interval_days": 90, "version": 1})
    assert patched.status_code == 200 and patched.json()["data"]["interval_days"] == 90

    proposal = await client.post("/api/v1/maintenance/schedules/optimize", headers=headers,
                                 json={"scope": {"equipment_id": p101}})
    assert proposal.status_code == 200, proposal.text
    prop = proposal.json()["data"]
    assert prop["status"] == "proposed" and "changes" in prop["diff"]

    applied = await client.post(f"/api/v1/maintenance/proposals/{prop['id']}/apply", headers=headers)
    assert applied.status_code == 200 and applied.json()["data"]["status"] == "applied"

    # idempotent — second apply rejected
    again = await client.post(f"/api/v1/maintenance/proposals/{prop['id']}/apply", headers=headers)
    assert again.status_code == 422


async def test_beat_generates_due_work_orders(db, client):
    """The hourly PM checker turns due schedules into source=schedule work orders."""
    await seed_run()
    headers = await _admin_headers(client)
    from app.core.database import SessionFactory
    from app.modules.maintenance.service import ScheduleService
    from app.modules.tenants.models import Tenant
    from sqlalchemy import select as _select

    async with SessionFactory() as session:
        tenant = (await session.execute(_select(Tenant))).scalars().first()
        created = await ScheduleService(session, tenant.id).generate_due()
        await session.commit()
    assert len(created) >= 1  # FW-P1 quarterly test is overdue in the seed

    schedule_src = await client.get("/api/v1/work-orders", headers=headers,
                                    params={"source": "schedule", "page_size": 100})
    assert schedule_src.json()["meta"]["pagination"]["total"] == len(created)


# ── equipment history provider (B3 interface) ────────────────────────────────
async def test_equipment_history_includes_wos_and_failures(db, client):
    await seed_run()
    headers = await _admin_headers(client)
    p101 = await _equipment_id(client, headers, "P-101")
    resp = await client.get(f"/api/v1/equipment/{p101}/history", headers=headers)
    assert resp.status_code == 200
    sources = {e["source"] for e in resp.json()["data"]}
    assert "work_order" in sources and "failure" in sources


async def test_equipment_metrics_include_maintenance(db, client):
    await seed_run()
    headers = await _admin_headers(client)
    p101 = await _equipment_id(client, headers, "P-101")
    resp = await client.get(f"/api/v1/equipment/{p101}/metrics", headers=headers)
    assert resp.status_code == 200
    m = resp.json()["data"]
    assert m["failures"] == 3 and m["mttr_hours"] is not None


# ── ai-context (cited) ────────────────────────────────────────────────────────
async def test_ai_context_shape_and_citations(db, client):
    await seed_run()
    headers = await _admin_headers(client)
    p101 = await _equipment_id(client, headers, "P-101")
    wos = await client.get("/api/v1/work-orders", headers=headers,
                           params={"equipment_id": p101, "page_size": 1})
    wo_id = wos.json()["data"][0]["id"]

    resp = await client.get(f"/api/v1/work-orders/{wo_id}/ai-context", headers=headers)
    assert resp.status_code == 200, resp.text
    ctx = resp.json()["data"]
    assert ctx["equipment_tag"] == "P-101"
    # known failure modes come from real frequencies over the seeded failures
    assert any(m["mode"] and m["frequency"] >= 1 for m in ctx["failure_modes"])
    # similar WOs carry a citation object
    for s in ctx["similar_work_orders"]:
        assert s["citation"] is not None
