"""Users / roles / lookups / audit functional tests (docs/02 §6, §24, §25, §27)."""

from __future__ import annotations

from seeds.seed import DEMO_PASSWORD
from seeds.seed import run as seed_run
from tests.authz import setup_rbac_world


async def _login(client, email: str, password: str = DEMO_PASSWORD) -> str:
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["access_token"]


# ── /auth/me shows distinct permission sets per role (the B2 verify step) ──────
async def test_me_shows_distinct_permission_sets(db, client):
    await seed_run()

    async def me(email: str):
        token = await _login(client, email)
        resp = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        return set(data["permissions"]), data["roles"]

    admin_perms, admin_roles = await me("admin@indusmind.io")
    tech_perms, tech_roles = await me("technician@indusmind.io")
    comp_perms, _ = await me("compliance@indusmind.io")

    assert admin_roles == ["Admin"]
    assert tech_roles == ["Field Technician"]
    # Distinct sets, technician strictly fewer than admin.
    assert admin_perms != tech_perms != comp_perms
    assert tech_perms < admin_perms
    assert "user.manage" in admin_perms and "user.manage" not in tech_perms
    assert "comp.evidence.generate" in comp_perms and "comp.evidence.generate" not in tech_perms


# ── changing a role's permissions forces stale tokens to refresh (docs/02 §6) ──
async def test_role_permission_change_invalidates_tokens(db, client):
    tokens = await setup_rbac_world(client)
    op_headers = {"Authorization": f"Bearer {tokens['Operator']}"}
    admin_headers = {"Authorization": f"Bearer {tokens['Admin']}"}

    # Operator can't list users.
    assert (await client.get("/api/v1/users", headers=op_headers)).status_code == 403

    roles = (await client.get("/api/v1/roles", headers=admin_headers)).json()["data"]
    op_role = next(r for r in roles if r["name"] == "Operator")
    perms = (await client.get("/api/v1/permissions", headers=admin_headers)).json()["data"]
    target_codes = set(op_role["permissions"]) | {"user.manage"}
    ids = [p["id"] for p in perms if p["code"] in target_codes]

    put = await client.put(f"/api/v1/roles/{op_role['id']}/permissions",
                           json={"permission_ids": ids}, headers=admin_headers)
    assert put.status_code == 200

    # The Operator's OLD token is now invalid (token_version bumped) → must refresh.
    assert (await client.get("/api/v1/users", headers=op_headers)).status_code == 401


# ── lookups drive dropdowns from the DB (docs/02 §27) ─────────────────────────
async def test_lookups_category_returns_seeded_values(db, client):
    await seed_run()
    token = await _login(client, "technician@indusmind.io")
    resp = await client.get("/api/v1/lookups/doc_types",
                            headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    codes = {row["code"] for row in resp.json()["data"]}
    assert {"pid", "sop", "work_order"} <= codes


# ── every mutation writes an audit row (docs/02 §25) ──────────────────────────
async def test_mutation_writes_audit_log(db, client):
    tokens = await setup_rbac_world(client)
    admin_headers = {"Authorization": f"Bearer {tokens['Admin']}"}

    created = await client.post(
        "/api/v1/users",
        json={"email": "newbie@authz.io", "full_name": "Newbie", "password": "Passw0rd!"},
        headers=admin_headers,
    )
    assert created.status_code == 201, created.text
    new_id = created.json()["data"]["id"]

    log = await client.get("/api/v1/audit-log", params={"action": "user.create"},
                           headers=admin_headers)
    assert log.status_code == 200
    assert "user.create" in {row["action"] for row in log.json()["data"]}

    # Per-entity history endpoint returns this user's create row.
    hist = await client.get(f"/api/v1/audit-log/entity/user/{new_id}", headers=admin_headers)
    assert hist.status_code == 200
    assert any(row["entity_id"] == new_id for row in hist.json()["data"])
