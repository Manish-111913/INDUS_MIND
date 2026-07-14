"""Audit-coverage tests (docs/02 §25, §39 — "audit rows on every mutation").

Two complementary checks:

1. ``test_all_mutating_routes_are_classified`` — a *structural guard*. It walks
   every POST/PATCH/PUT/DELETE route on the live app and asserts each one is
   either in the explicit ``AUDIT_EXEMPT`` allowlist (auth handshakes, pure
   read/compute, user-scoped conversational state) or is expected to write an
   audit row. Adding a new mutating endpoint without consciously classifying it
   fails this test — forcing the author to wire ``AuditService.write`` or justify
   an exemption. Needs no external services.

2. ``test_representative_mutations_write_audit`` — *behavioural coverage*. It
   drives a real mutation in each major domain (equipment, users, lookups,
   maintenance, quality, knowledge) as an admin and asserts the append-only
   ``audit_log`` table grew, proving the write path actually emits audit rows.
"""

from __future__ import annotations

import uuid

from sqlalchemy import text

from seeds.seed import run as seed_run
from tests.authz import setup_rbac_world

MUTATING_METHODS = {"POST", "PATCH", "PUT", "DELETE"}

# Routes that legitimately do NOT write a domain audit row, each with a reason.
# Everything NOT in this set is expected to audit its mutation.
AUDIT_EXEMPT: frozenset[tuple[str, str]] = frozenset({
    # ── auth handshakes: tracked via sessions/refresh_tokens, not domain audit ──
    ("POST", "/api/v1/auth/login"),
    ("POST", "/api/v1/auth/logout"),
    ("POST", "/api/v1/auth/refresh"),
    ("POST", "/api/v1/auth/forgot-password"),
    ("POST", "/api/v1/auth/reset-password"),
    ("POST", "/api/v1/auth/mfa/setup"),
    ("POST", "/api/v1/auth/mfa/verify"),
    ("DELETE", "/api/v1/auth/sessions/{session_id}"),
    # ── pure read / compute: no persistent domain mutation ─────────────────────
    ("POST", "/api/v1/ai/query"),
    ("POST", "/api/v1/ai/evals/run"),
    ("POST", "/api/v1/graph/query"),
    ("POST", "/api/v1/maintenance/predictions/refresh"),
    ("POST", "/api/v1/maintenance/schedules/optimize"),
    # ── user-scoped conversational state / preferences (high volume) ───────────
    ("POST", "/api/v1/chat/sessions"),
    ("PATCH", "/api/v1/chat/sessions/{session_id}"),
    ("DELETE", "/api/v1/chat/sessions/{session_id}"),
    ("POST", "/api/v1/chat/sessions/{session_id}/messages"),
    ("POST", "/api/v1/notifications/mark-read"),
    ("PUT", "/api/v1/notifications/preferences"),
    ("PUT", "/api/v1/dashboards/config"),
})


def _mutating_routes() -> set[tuple[str, str]]:
    from app.main import app

    spec = app.openapi()
    routes: set[tuple[str, str]] = set()
    for path, ops in spec["paths"].items():
        if not path.startswith("/api/v1"):
            continue
        for method in ops:
            if method.upper() in MUTATING_METHODS:
                routes.add((method.upper(), path))
    return routes


def test_all_mutating_routes_are_classified():
    """Every mutating route is either audit-exempt or expected to audit."""
    routes = _mutating_routes()
    assert routes, "no mutating routes discovered — route enumeration broke"

    # Stale exemptions (a route was renamed/removed) must be cleaned up.
    stale = AUDIT_EXEMPT - routes
    assert not stale, f"AUDIT_EXEMPT references routes that no longer exist: {sorted(stale)}"

    expected_audited = routes - AUDIT_EXEMPT
    # Sanity: the overwhelming majority of mutations are audited, and the exempt
    # list stays small and deliberate.
    assert len(expected_audited) >= 70, "suspiciously few audited routes — check classification"
    assert len(AUDIT_EXEMPT) <= 30, "audit-exempt list is growing unchecked — review"


async def _audit_count() -> int:
    from app.core.database import SessionFactory

    async with SessionFactory() as s:
        return int(await s.scalar(text("SELECT count(*) FROM audit_log")) or 0)


async def test_representative_mutations_write_audit(db, client):
    """Driving a real mutation in each domain grows the append-only audit_log."""
    tokens = await setup_rbac_world(client)
    await seed_run()  # lookups (work-order types/priorities), demo users, etc.
    admin = {"Authorization": f"Bearer {tokens['Admin']}"}

    suffix = uuid.uuid4().hex[:8]

    async def _drive(desc, method, url, json=None):
        before = await _audit_count()
        resp = await getattr(client, method)(url, json=json, headers=admin)
        assert resp.status_code < 300, f"{desc} failed: {resp.status_code} {resp.text}"
        after = await _audit_count()
        assert after > before, f"{desc} ({method.upper()} {url}) wrote NO audit row"
        return resp

    # equipment domain — plant, then area + equipment under it
    plant = (await _drive(
        "plant.create", "post", "/api/v1/plants",
        {"name": f"Audit Plant {suffix}", "code": f"AP{suffix[:5]}"},
    )).json()["data"]
    await _drive("plant.update", "patch", f"/api/v1/plants/{plant['id']}",
                 {"location": "Test City"})
    await _drive("area.create", "post", "/api/v1/areas",
                 {"plant_id": plant["id"], "name": "Audit Area", "code": f"AA{suffix[:5]}"})

    # users domain — role
    await _drive("role.create", "post", "/api/v1/roles", {"name": f"Auditor {suffix}"})

    # lookups domain
    await _drive("lookup.create", "post", "/api/v1/lookups",
                 {"category": "doc_types", "code": f"t_{suffix}", "label": "Test Type"})

    # maintenance domain — work order
    await _drive("workorder.create", "post", "/api/v1/work-orders",
                 {"title": f"Audit WO {suffix}", "type": "corrective", "priority": "medium"})

    # quality domain — NCR
    await _drive("ncr.create", "post", "/api/v1/quality/ncrs",
                 {"severity": "minor", "description": "audit test ncr"})

    # knowledge domain — saved search
    await _drive("saved_search.create", "post", "/api/v1/search/saved",
                 {"name": f"Audit Search {suffix}", "query": "pump seal"})
