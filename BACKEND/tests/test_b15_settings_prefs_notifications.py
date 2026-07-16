"""B15 — settings, preferences, saved views, notification templates (docs/05 S1-S3).

Covers: settings resolution order (user > plant > tenant > system default) + value
validation + cache-busting, preference upsert, saved-view sharing/authz, event
notification-preference matrix, template preview rendering, and daily-digest
grouping. Runs against real Postgres/Redis (skips if unavailable via the `db`
fixture).
"""

from __future__ import annotations

import uuid

from sqlalchemy import select

from app.core.database import SessionFactory
from app.modules.auth.models import User
from app.modules.equipment.models import Plant
from seeds.seed import DEMO_PASSWORD
from seeds.seed import run as seed_run


async def _login(client, email: str, password: str = DEMO_PASSWORD) -> str:
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _ids(email: str) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    """(user_id, tenant_id, a plant_id) for the seeded demo."""
    async with SessionFactory() as session:
        user = (await session.execute(select(User).where(User.email == email))).scalar_one()
        plant = (await session.execute(
            select(Plant).where(Plant.tenant_id == user.tenant_id))).scalars().first()
        return user.id, user.tenant_id, plant.id


# ── S1 settings ───────────────────────────────────────────────────────────────
async def test_settings_effective_returns_defaults(db, client):
    await seed_run()
    token = await _login(client, "technician@indusmind.io")
    resp = await client.get("/api/v1/settings/effective", headers=_auth(token))
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    # System defaults resolve from the DB definitions, not code constants.
    assert data["locale.currency"] == "INR"
    assert data["units.pressure"] == "bar"
    assert data["branding.app_name"] == "IndusMind"


async def test_settings_resolution_order_user_over_plant_over_tenant(db, client):
    await seed_run()
    admin_id, _tenant_id, plant_id = await _ids("admin@indusmind.io")
    token = await _login(client, "admin@indusmind.io")

    async def put(scope, scope_id, value):
        body = {"key": "branding.app_name", "scope": scope, "value": value}
        if scope_id is not None:
            body["scope_id"] = str(scope_id)
        r = await client.put("/api/v1/settings", json=body, headers=_auth(token))
        assert r.status_code == 200, r.text

    async def effective():
        r = await client.get(f"/api/v1/settings/effective?plant_id={plant_id}", headers=_auth(token))
        assert r.status_code == 200, r.text
        return r.json()["data"]["branding.app_name"]

    # tenant override wins over the system default
    await put("tenant", None, "TenantName")
    assert await effective() == "TenantName"
    # plant override wins over tenant (cache is busted on every write)
    await put("plant", plant_id, "PlantName")
    assert await effective() == "PlantName"
    # user override wins over plant
    await put("user", admin_id, "UserName")
    assert await effective() == "UserName"


async def test_settings_value_validation(db, client):
    await seed_run()
    token = await _login(client, "admin@indusmind.io")
    # invalid enum
    r = await client.put("/api/v1/settings",
                         json={"key": "units.system", "scope": "tenant", "value": "nonsense"},
                         headers=_auth(token))
    assert r.status_code == 400, r.text
    assert r.json()["error"]["code"] == "SETTING_ENUM_INVALID"
    # unknown key
    r = await client.put("/api/v1/settings",
                         json={"key": "does.not.exist", "scope": "tenant", "value": "x"},
                         headers=_auth(token))
    assert r.status_code == 404, r.text


async def test_settings_admin_requires_permission(db, client):
    await seed_run()
    token = await _login(client, "technician@indusmind.io")  # lacks settings.manage
    r = await client.get("/api/v1/settings", headers=_auth(token))
    assert r.status_code == 403, r.text


# ── S2 preferences + saved views ──────────────────────────────────────────────
async def test_preference_upsert(db, client):
    await seed_run()
    token = await _login(client, "technician@indusmind.io")
    key = "table:work_orders"
    r = await client.put(f"/api/v1/me/preferences/{key}",
                         json={"value": {"columns": ["a", "b"], "density": "compact"}},
                         headers=_auth(token))
    assert r.status_code == 200, r.text
    r = await client.get(f"/api/v1/me/preferences/{key}", headers=_auth(token))
    assert r.json()["data"]["value"]["density"] == "compact"
    # upsert overwrites
    r = await client.put(f"/api/v1/me/preferences/{key}",
                         json={"value": {"density": "comfortable"}}, headers=_auth(token))
    assert r.status_code == 200
    r = await client.get(f"/api/v1/me/preferences/{key}", headers=_auth(token))
    assert r.json()["data"]["value"] == {"density": "comfortable"}


async def test_saved_view_sharing_and_authz(db, client):
    await seed_run()
    tech = await _login(client, "technician@indusmind.io")
    other = await _login(client, "engineer@indusmind.io")

    # tech creates a shared view
    r = await client.post("/api/v1/saved-views",
                          json={"entity": "work_orders", "name": "My open WOs",
                                "filters": {"status": "open"}, "is_shared": True},
                          headers=_auth(tech))
    assert r.status_code == 201, r.text
    view_id = r.json()["data"]["id"]

    # shared view visible to another user tenant-wide
    r = await client.get("/api/v1/saved-views?entity=work_orders", headers=_auth(other))
    assert any(v["id"] == view_id for v in r.json()["data"]), r.text

    # non-owner without views.manage cannot mutate
    r = await client.patch(f"/api/v1/saved-views/{view_id}", json={"name": "hijack"},
                           headers=_auth(other))
    assert r.status_code == 403, r.text

    # invalid entity rejected
    r = await client.post("/api/v1/saved-views", json={"entity": "bogus", "name": "x"},
                          headers=_auth(tech))
    assert r.status_code == 422, r.text


# ── S3 notification event prefs + templates ───────────────────────────────────
async def test_event_preference_matrix(db, client):
    await seed_run()
    token = await _login(client, "technician@indusmind.io")
    r = await client.get("/api/v1/me/notification-preferences", headers=_auth(token))
    assert r.status_code == 200, r.text
    prefs = r.json()["data"]["preferences"]
    # One row per seeded event code — derived from the seed rather than a hardcoded
    # count, so adding a template (e.g. S6's export.completed) doesn't break this.
    from seeds.seed import NOTIFICATION_TEMPLATES

    expected_codes = {code for code, *_ in NOTIFICATION_TEMPLATES}
    assert {p["event_code"] for p in prefs} == expected_codes
    assert len(prefs) == len(expected_codes)
    assert {"in_app", "email", "digest"} <= set(prefs[0].keys())

    r = await client.put("/api/v1/me/notification-preferences",
                         json={"preferences": [{"event_code": "prediction.created",
                                                "in_app": True, "email": True, "digest": "daily"}]},
                         headers=_auth(token))
    assert r.status_code == 200, r.text
    updated = {p["event_code"]: p for p in r.json()["data"]["preferences"]}
    assert updated["prediction.created"]["digest"] == "daily"


async def test_template_preview_renders(db, client):
    await seed_run()
    token = await _login(client, "admin@indusmind.io")
    # inline preview renders Jinja2 against a sample payload
    r = await client.post("/api/v1/admin/notification-templates/preview",
                          json={"subject_tpl": "WO {{ wo_number }}",
                                "body_tpl": "Assigned to {{ name }}",
                                "sample_payload": {"wo_number": "WO-9", "name": "Arun"}},
                          headers=_auth(token))
    assert r.status_code == 200, r.text
    assert r.json()["data"] == {"subject": "WO WO-9", "body": "Assigned to Arun"}

    # preview a seeded system template by id
    r = await client.get("/api/v1/admin/notification-templates?event_code=prediction.created",
                         headers=_auth(token))
    templates = r.json()["data"]
    assert templates, "expected seeded system templates"
    tid = templates[0]["id"]
    r = await client.post("/api/v1/admin/notification-templates/preview",
                          json={"template_id": tid}, headers=_auth(token))
    assert r.status_code == 200, r.text
    assert "P-101" in r.json()["data"]["subject"] + r.json()["data"]["body"]


async def test_template_admin_requires_permission(db, client):
    await seed_run()
    token = await _login(client, "technician@indusmind.io")
    r = await client.get("/api/v1/admin/notification-templates", headers=_auth(token))
    assert r.status_code == 403, r.text


# ── S3 daily-digest grouping ──────────────────────────────────────────────────
async def test_digest_groups_daily_events(db, client, monkeypatch):
    await seed_run()
    admin_id, tenant_id, _plant = await _ids("admin@indusmind.io")

    from app.modules.notifications import senders
    from app.modules.notifications.models import Notification, NotificationEventPreference

    # admin opts prediction.created into a daily digest; seed two matching notifications.
    async with SessionFactory() as session:
        session.add(NotificationEventPreference(
            tenant_id=tenant_id, user_id=admin_id, event_code="prediction.created",
            in_app=True, email=True, digest="daily"))
        for i in range(2):
            session.add(Notification(
                tenant_id=tenant_id, user_id=admin_id, category="prediction",
                event_code="prediction.created", priority="high",
                title=f"Predictive alert {i}", channels_sent=[]))
        # a non-daily notification must NOT be grouped
        session.add(Notification(
            tenant_id=tenant_id, user_id=admin_id, category="system",
            event_code="document.ingested", priority="normal", title="Doc done", channels_sent=[]))
        await session.commit()

    captured: list[dict] = []

    async def _fake_send(session, tid, *, to_email, subject, body, html=None, template_id=None):
        captured.append({"to": to_email, "subject": subject, "body": body})
        return True

    monkeypatch.setattr(senders, "send_email_logged", _fake_send)

    from app.workers.tasks.scheduler_tasks import _run_notification_digest

    result = await _run_notification_digest()
    assert result["digests_sent"] == 1, result
    assert len(captured) == 1
    body = captured[0]["body"]
    assert "Predictive alert 0" in body and "Predictive alert 1" in body
    assert "Doc done" not in body  # only daily-digest events are grouped
