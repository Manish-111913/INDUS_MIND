"""B18 / docs-05 S10 — guided tour, changelog, and idempotent sample-data loading."""

from __future__ import annotations

import httpx
from sqlalchemy import func, select

from app.core.database import SessionFactory
from app.modules.onboarding.models import Tour
from app.modules.onboarding.service import (
    release_seed_demo_lock,
    seed_demo_lock_key,
    try_seed_demo_lock,
)
from app.modules.tenants.models import Tenant
from seeds.seed import DEMO_PASSWORD
from seeds.seed import run as seed_run


async def _token(client: httpx.AsyncClient, email: str = "admin@indusmind.io") -> str:
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    return r.json()["data"]["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _tenant_id():
    async with SessionFactory() as s:
        return (await s.execute(select(Tenant))).scalars().first().id


# ── tours ────────────────────────────────────────────────────────────────────
async def test_main_tour_is_seeded_with_ordered_steps(db, client):
    await seed_run()
    token = await _token(client)
    r = await client.get("/api/v1/tours/main", headers=_auth(token))
    assert r.status_code == 200

    tour = r.json()["data"]
    assert tour["code"] == "main"
    steps = tour["steps"]
    assert len(steps) == 8
    # The tour is only coherent in order, so the API must return it sorted.
    assert [s["order_no"] for s in steps] == sorted(s["order_no"] for s in steps)
    assert all(s["title"] and s["body"] for s in steps)


async def test_tour_is_readable_by_any_authenticated_role(db, client):
    """The shell offers the tour on first login, so a technician must get it too."""
    await seed_run()
    token = await _token(client, "technician@indusmind.io")
    assert (await client.get("/api/v1/tours/main", headers=_auth(token))).status_code == 200


async def test_tour_requires_authentication(db, client):
    await seed_run()
    assert (await client.get("/api/v1/tours/main")).status_code == 401


async def test_unknown_tour_code_404s(db, client):
    await seed_run()
    token = await _token(client)
    assert (await client.get("/api/v1/tours/nope", headers=_auth(token))).status_code == 404


async def test_editing_a_system_tour_copies_it_to_the_tenant(db, client):
    """A system tour is shared by every tenant — an edit must not mutate it in
    place, or one tenant's change would leak to all of them."""
    await seed_run()
    token = await _token(client)
    tour = (await client.get("/api/v1/tours/main", headers=_auth(token))).json()["data"]

    r = await client.put(f"/api/v1/admin/tours/{tour['id']}",
                         json={"code": "main", "name": "Our tour", "is_active": True,
                               "steps": [{"order_no": 1, "title": "Ours", "body": "b"}]},
                         headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["data"]["id"] != tour["id"], "system tour was edited in place"

    async with SessionFactory() as s:
        system = (await s.execute(select(Tour).where(Tour.tenant_id.is_(None),
                                                     Tour.code == "main"))).scalars().first()
    assert system.name == "Product tour", "the shared system tour was mutated"

    # The tenant's override now wins for this tenant.
    after = (await client.get("/api/v1/tours/main", headers=_auth(token))).json()["data"]
    assert after["name"] == "Our tour" and len(after["steps"]) == 1


async def test_tour_admin_requires_permission(db, client):
    await seed_run()
    tech = await _token(client, "technician@indusmind.io")
    assert (await client.get("/api/v1/admin/tours", headers=_auth(tech))).status_code == 403


# ── changelog ────────────────────────────────────────────────────────────────
async def test_changelog_is_seeded_newest_first(db, client):
    await seed_run()
    token = await _token(client)
    r = await client.get("/api/v1/changelog", headers=_auth(token))
    assert r.status_code == 200

    entries = r.json()["data"]
    assert len(entries) >= 3
    dates = [e["released_at"] for e in entries]
    assert dates == sorted(dates, reverse=True), "changelog must read newest-first"


async def test_changelog_hides_unpublished_from_the_public_route(db, client):
    await seed_run()
    token = await _token(client)
    created = (await client.post("/api/v1/admin/changelog",
                                 json={"version": "9.9.9", "title": "Draft", "body_md": "x",
                                       "is_published": False},
                                 headers=_auth(token))).json()["data"]

    public = (await client.get("/api/v1/changelog", headers=_auth(token))).json()["data"]
    assert created["id"] not in [e["id"] for e in public]
    # ...but an admin listing it can see the draft.
    admin = (await client.get("/api/v1/admin/changelog", headers=_auth(token))).json()["data"]
    assert created["id"] in [e["id"] for e in admin]


async def test_changelog_readable_by_any_authenticated_role(db, client):
    await seed_run()
    token = await _token(client, "technician@indusmind.io")
    assert (await client.get("/api/v1/changelog", headers=_auth(token))).status_code == 200


# ── seed-demo ────────────────────────────────────────────────────────────────
def test_seed_demo_lock_key_is_stable_and_in_range():
    a = "f6a38c92-bd93-4431-a0f6-633df5a94470"
    assert seed_demo_lock_key(a) == seed_demo_lock_key(a)          # stable
    assert seed_demo_lock_key(a) != seed_demo_lock_key("11111111-1111-1111-1111-111111111111")
    # Must fit the int4 that pg_try_advisory_lock(int, int) takes.
    assert 0 <= seed_demo_lock_key(a) < 2**31


async def test_advisory_lock_blocks_a_concurrent_seed(db, client):
    """The lock is what makes POST /admin/seed-demo idempotent under a double
    click: the second caller is told it's already running, not queued again."""
    await seed_run()
    tenant_id = await _tenant_id()

    async with SessionFactory() as first:
        assert await try_seed_demo_lock(first, tenant_id) is True
        # A different session must not get the same tenant's lock.
        async with SessionFactory() as second:
            assert await try_seed_demo_lock(second, tenant_id) is False
        await release_seed_demo_lock(first, tenant_id)

    # Once released, it's available again.
    async with SessionFactory() as third:
        assert await try_seed_demo_lock(third, tenant_id) is True
        await release_seed_demo_lock(third, tenant_id)


async def test_a_locked_tenant_does_not_block_another_tenant(db, client):
    await seed_run()
    tenant_id = await _tenant_id()
    other = "11111111-2222-3333-4444-555555555555"

    async with SessionFactory() as a, SessionFactory() as b:
        assert await try_seed_demo_lock(a, tenant_id) is True
        assert await try_seed_demo_lock(b, other) is True, "lock is not per-tenant"
        await release_seed_demo_lock(a, tenant_id)
        await release_seed_demo_lock(b, other)


async def test_seed_demo_is_idempotent(db, client):
    """Running it twice must not duplicate the plant — the whole point of the
    'Load sample data' button being safe to press again."""
    from app.modules.onboarding.service import run_seed_demo

    await seed_run()
    tenant_id = await _tenant_id()

    async def _counts() -> tuple[int, int, int]:
        async with SessionFactory() as s:
            from app.modules.equipment.models import Equipment, Plant

            return (
                (await s.execute(select(func.count()).select_from(Plant))).scalar(),
                (await s.execute(select(func.count()).select_from(Equipment))).scalar(),
                (await s.execute(select(func.count()).select_from(Tenant))).scalar(),
            )

    before = await _counts()
    result = await run_seed_demo(tenant_id)
    assert result["status"] == "completed"
    after = await _counts()
    assert after == before, f"seed-demo duplicated rows: {before} → {after}"


async def test_seed_demo_reports_already_running_when_locked(db, client):
    from app.modules.onboarding.service import run_seed_demo

    await seed_run()
    tenant_id = await _tenant_id()

    async with SessionFactory() as holder:
        assert await try_seed_demo_lock(holder, tenant_id) is True
        result = await run_seed_demo(tenant_id)
        assert result["status"] == "already_running"
        await release_seed_demo_lock(holder, tenant_id)


async def test_seed_demo_endpoint_requires_permission(db, client):
    await seed_run()
    tech = await _token(client, "technician@indusmind.io")
    assert (await client.post("/api/v1/admin/seed-demo", headers=_auth(tech))).status_code == 403


# ── notification templates (B18 item 5) ──────────────────────────────────────
async def test_part_low_stock_and_export_completed_templates_are_seeded(db, client):
    await seed_run()
    from app.modules.notifications.models import NotificationTemplate

    async with SessionFactory() as s:
        rows = (await s.execute(
            select(NotificationTemplate).where(
                NotificationTemplate.event_code.in_(["part.low_stock", "export.completed"])))
        ).scalars().all()

    by_event = {(r.event_code, r.channel) for r in rows}
    for event in ("part.low_stock", "export.completed"):
        assert (event, "in_app") in by_event, f"{event} in_app template missing"
        assert (event, "email") in by_event, f"{event} email template missing"


async def test_low_stock_template_renders_with_its_sample_payload(db, client):
    """A template whose sample payload doesn't render is a broken admin preview."""
    await seed_run()
    from app.modules.notifications import templating
    from app.modules.notifications.models import NotificationTemplate

    async with SessionFactory() as s:
        tpl = (await s.execute(
            select(NotificationTemplate).where(
                NotificationTemplate.event_code == "part.low_stock",
                NotificationTemplate.channel == "email"))).scalars().first()

    subject = templating.render(tpl.subject_tpl, tpl.sample_payload)
    body = templating.render(tpl.body_tpl, tpl.sample_payload)
    assert "SEAL-40M" in subject
    assert "SEAL-40M" in body and "{{" not in body
