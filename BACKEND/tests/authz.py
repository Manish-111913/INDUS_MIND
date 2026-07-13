"""Authorization-matrix harness (docs/02 §54): endpoint × role → 200/403.

Reusable across modules. `ENDPOINTS` is the growing registry of permission-guarded
routes; later modules append their entries. `setup_rbac_world` builds the full
RBAC world (permissions, roles wired to the docs/01 §22 matrix, one user per
system role) and returns a bearer token per role.

Assertion contract: a role WITHOUT the endpoint's permission must get 403; a role
WITH it must get anything BUT 403 (200/201/404/422 are all fine — we're testing
the RBAC gate, not the handler's happy path).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from httpx import AsyncClient
from sqlalchemy import select

from app.core.database import SessionFactory
from app.core.security import hash_password
from app.modules.auth.models import User
from app.modules.tenants.models import Tenant
from app.modules.users.catalog import PERMISSIONS, SYSTEM_ROLES, permissions_for_role
from app.modules.users.models import Permission, Role
from app.modules.users.repository import RoleRepository, UserRoleRepository

WORLD_PASSWORD = "Test@1234"
ROLE_NAMES = [name for name, _ in SYSTEM_ROLES]


@dataclass(frozen=True)
class GuardedEndpoint:
    method: str
    path: str
    permission: str
    body: dict | None = None
    label: str = ""


# Registry — later modules extend this list with their guarded endpoints.
ENDPOINTS: list[GuardedEndpoint] = [
    GuardedEndpoint("GET", "/api/v1/users", "user.manage"),
    GuardedEndpoint("POST", "/api/v1/users", "user.manage",
                    {"email": "matrix.new@indusmind.io", "full_name": "New",
                     "password": "Passw0rd!"}),
    GuardedEndpoint("GET", "/api/v1/roles", "role.manage"),
    GuardedEndpoint("GET", "/api/v1/permissions", "role.manage"),
    GuardedEndpoint("GET", "/api/v1/audit-log", "audit.read"),
    GuardedEndpoint("POST", "/api/v1/lookups", "tenant.manage",
                    {"category": "matrix_cat", "code": "c1", "label": "C1"}),
    GuardedEndpoint("PUT", "/api/v1/feature-flags", "flag.manage",
                    {"key": "matrix_flag", "enabled": True}),
    # equipment module
    GuardedEndpoint("GET", "/api/v1/equipment", "equip.read"),
    GuardedEndpoint("GET", "/api/v1/plants", "equip.read"),
    GuardedEndpoint("GET", "/api/v1/equipment/resolve?tag=P-101", "equip.read"),
    GuardedEndpoint("POST", "/api/v1/plants", "equip.manage",
                    {"name": "Matrix Plant", "code": "MTX"}),
    GuardedEndpoint("POST", "/api/v1/equipment", "equip.manage",
                    {"plant_id": "00000000-0000-0000-0000-000000000001",
                     "tag": "matrix-eq", "name": "Matrix Eq"}),
    # documents module
    GuardedEndpoint("GET", "/api/v1/documents", "doc.read"),
    GuardedEndpoint("POST", "/api/v1/documents/upload-url", "doc.create",
                    {"filename": "m.pdf", "mime": "application/pdf", "size": 1024}),
    GuardedEndpoint("POST", "/api/v1/documents/00000000-0000-0000-0000-000000000009/reprocess",
                    "doc.reprocess", {}),
    GuardedEndpoint("DELETE", "/api/v1/documents/00000000-0000-0000-0000-000000000009",
                    "doc.delete"),
    # ingestion module (admin monitor)
    GuardedEndpoint("GET", "/api/v1/ingestion/jobs", "doc.reprocess"),
    GuardedEndpoint("POST", "/api/v1/ingestion/jobs/00000000-0000-0000-0000-000000000009/retry",
                    "doc.reprocess", {}),
    GuardedEndpoint("POST", "/api/v1/ingestion/jobs/00000000-0000-0000-0000-000000000009/cancel",
                    "doc.reprocess", {}),
    # entities (human-in-the-loop)
    GuardedEndpoint("GET", "/api/v1/documents/00000000-0000-0000-0000-000000000009/entities",
                    "doc.read"),
    GuardedEndpoint("PATCH", "/api/v1/entities/00000000-0000-0000-0000-000000000009",
                    "doc.update", {"status": "confirmed"}),
    # knowledge graph
    GuardedEndpoint("POST", "/api/v1/graph/query", "graph.read",
                    {"start_type": "Equipment", "start_key": "P-101"}),
    GuardedEndpoint("POST", "/api/v1/graph/rebuild", "tenant.manage", {}),
]


async def _seed_permissions(session) -> dict[str, Permission]:
    existing = {p.code: p for p in (await session.execute(select(Permission))).scalars()}
    for code, resource, action, desc in PERMISSIONS:
        if code not in existing:
            perm = Permission(code=code, resource=resource, action=action, description=desc)
            session.add(perm)
            existing[code] = perm
    await session.flush()
    return existing


async def setup_rbac_world(client: AsyncClient) -> dict[str, str]:
    """Create the RBAC world and return {role_name: access_token}."""
    async with SessionFactory() as session:
        perms = await _seed_permissions(session)
        tenant = Tenant(name="AuthZ Co", slug=f"authz-{uuid.uuid4().hex[:8]}")
        session.add(tenant)
        await session.flush()

        role_repo = RoleRepository(session, tenant.id)
        user_roles = UserRoleRepository(session)
        emails: dict[str, str] = {}
        for name, description in SYSTEM_ROLES:
            role = Role(tenant_id=tenant.id, name=name, description=description, is_system=True)
            session.add(role)
            await session.flush()
            ids = [perms[c].id for c in permissions_for_role(name) if c in perms]
            await role_repo.set_permissions(role.id, ids)

            email = f"{name.lower().replace(' ', '_')}@authz.io"
            emails[name] = email
            user = User(tenant_id=tenant.id, email=email, full_name=name,
                        password_hash=hash_password(WORLD_PASSWORD), status="active")
            session.add(user)
            await session.flush()
            await user_roles.set_roles(user.id, [role.id])
        await session.commit()

    tokens: dict[str, str] = {}
    for name, email in emails.items():
        resp = await client.post(
            "/api/v1/auth/login", json={"email": email, "password": WORLD_PASSWORD}
        )
        assert resp.status_code == 200, resp.text
        tokens[name] = resp.json()["data"]["access_token"]
    return tokens


def role_has_permission(role_name: str, permission: str) -> bool:
    return permission in permissions_for_role(role_name)
