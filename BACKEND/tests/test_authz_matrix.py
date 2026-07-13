"""Authorization-matrix test (docs/02 §54): every guarded endpoint × every role.

Builds the RBAC world once, then asserts the RBAC gate for all endpoint × role
combinations: no permission → 403; has permission → not 403. Later modules add
their endpoints to `tests.authz.ENDPOINTS` and this test covers them for free.
"""

from __future__ import annotations

from tests.authz import ENDPOINTS, ROLE_NAMES, role_has_permission, setup_rbac_world


async def test_authorization_matrix(db, client):
    tokens = await setup_rbac_world(client)

    failures: list[str] = []
    for role in ROLE_NAMES:
        headers = {"Authorization": f"Bearer {tokens[role]}"}
        for ep in ENDPOINTS:
            resp = await client.request(ep.method, ep.path, json=ep.body, headers=headers)
            allowed = role_has_permission(role, ep.permission)
            if allowed and resp.status_code == 403:
                failures.append(f"{role} SHOULD access {ep.method} {ep.path} "
                                f"({ep.permission}) but got 403")
            if not allowed and resp.status_code != 403:
                failures.append(f"{role} should NOT access {ep.method} {ep.path} "
                                f"({ep.permission}); expected 403 got {resp.status_code}")

    assert not failures, "authorization matrix violations:\n" + "\n".join(failures)


async def test_open_endpoints_available_to_all_roles(db, client):
    """`GET /lookups/{category}` and `GET /feature-flags` need only authentication."""
    from seeds.seed import run as seed_run

    tokens = await setup_rbac_world(client)
    await seed_run()  # populate global lookups + demo flags
    for role in ROLE_NAMES:
        headers = {"Authorization": f"Bearer {tokens[role]}"}
        lk = await client.get("/api/v1/lookups/doc_types", headers=headers)
        assert lk.status_code == 200, f"{role} lookups: {lk.text}"
        ff = await client.get("/api/v1/feature-flags", headers=headers)
        assert ff.status_code == 200, f"{role} flags: {ff.text}"
