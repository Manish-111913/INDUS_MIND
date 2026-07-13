"""Users / roles / permissions / feature-flags HTTP router (docs/02 §24).

Router only maps HTTP ⇄ service; every write is permission-guarded at the router
(RBAC) and the service enforces resource scope + writes audit + invalidates
caches. Nothing hardcoded.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams
from app.common.responses import success
from app.core.database import get_session
from app.modules.auth.dependencies import CurrentUser, get_current_user, require
from app.modules.auth.models import User
from app.modules.users.schemas import (
    FeatureFlagUpsert,
    MessageResponse,
    PermissionRead,
    RoleCreate,
    RolePermissionsUpdate,
    RoleRead,
    RoleUpdate,
    UserCreate,
    UserInvite,
    UserRead,
    UserUpdate,
)
from app.modules.users.service import (
    FeatureFlagService,
    PermissionService,
    RoleService,
    UserService,
)

router = APIRouter(tags=["users"])


def _page(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
          sort: str | None = Query("-created_at")) -> PageParams:
    return PageParams(page=page, page_size=page_size, sort=sort)


def _user_read(user: User, roles: list[str]) -> dict:
    data = UserRead.model_validate(user).model_dump()
    data["roles"] = roles
    return data


def _role_read(role, perms: list[str]) -> dict:
    data = RoleRead.model_validate(role).model_dump()
    data["permissions"] = perms
    return data


# ── users ────────────────────────────────────────────────────────────────────
@router.get("/users", summary="List users")
async def list_users(
    params: PageParams = Depends(_page),
    status: str | None = Query(None),
    role_id: uuid.UUID | None = Query(None),
    actor: CurrentUser = Depends(require("user.manage")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    page, roles = await UserService(session, actor.tenant_id).list(params, status=status, role_id=role_id)
    items = [_user_read(u, roles[u.id]) for u in page.items]
    return success(items, meta=page.meta)


@router.post("/users", status_code=201, summary="Create a user")
async def create_user(
    body: UserCreate,
    actor: CurrentUser = Depends(require("user.manage")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user, roles = await UserService(session, actor.tenant_id).create(
        email=body.email, full_name=body.full_name, password=body.password,
        phone=body.phone, role_ids=body.role_ids, actor=actor,
    )
    return success(_user_read(user, roles))


@router.post("/users/invite", status_code=201, summary="Invite a user (email via mailhog)")
async def invite_user(
    body: UserInvite,
    actor: CurrentUser = Depends(require("user.manage")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user, roles = await UserService(session, actor.tenant_id).invite(
        email=body.email, full_name=body.full_name, role_ids=body.role_ids, actor=actor,
    )
    return success(_user_read(user, roles))


@router.get("/users/{user_id}", summary="Get a user")
async def get_user(
    user_id: uuid.UUID,
    actor: CurrentUser = Depends(require("user.manage")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user, roles = await UserService(session, actor.tenant_id).get(user_id)
    return success(_user_read(user, roles))


@router.patch("/users/{user_id}", summary="Update a user")
async def update_user(
    user_id: uuid.UUID, body: UserUpdate,
    actor: CurrentUser = Depends(require("user.manage")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user, roles = await UserService(session, actor.tenant_id).update(user_id, data=body, actor=actor)
    return success(_user_read(user, roles))


@router.delete("/users/{user_id}", summary="Deactivate + soft-delete a user")
async def delete_user(
    user_id: uuid.UUID,
    actor: CurrentUser = Depends(require("user.manage")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    await UserService(session, actor.tenant_id).delete(user_id, actor=actor)
    return success(MessageResponse(message="User deleted").model_dump())


@router.post("/users/{user_id}/activate", summary="Activate a user")
async def activate_user(
    user_id: uuid.UUID,
    actor: CurrentUser = Depends(require("user.manage")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user, roles = await UserService(session, actor.tenant_id).set_status(
        user_id, status="active", actor=actor)
    return success(_user_read(user, roles))


@router.post("/users/{user_id}/deactivate", summary="Deactivate a user")
async def deactivate_user(
    user_id: uuid.UUID,
    actor: CurrentUser = Depends(require("user.manage")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user, roles = await UserService(session, actor.tenant_id).set_status(
        user_id, status="disabled", actor=actor)
    return success(_user_read(user, roles))


# ── roles ────────────────────────────────────────────────────────────────────
@router.get("/roles", summary="List roles")
async def list_roles(
    actor: CurrentUser = Depends(require("role.manage")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    rows = await RoleService(session, actor.tenant_id).list()
    return success([_role_read(r, p) for r, p in rows])


@router.post("/roles", status_code=201, summary="Create a role")
async def create_role(
    body: RoleCreate,
    actor: CurrentUser = Depends(require("role.manage")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    role, perms = await RoleService(session, actor.tenant_id).create(
        name=body.name, description=body.description, permission_ids=body.permission_ids, actor=actor)
    return success(_role_read(role, perms))


@router.get("/roles/{role_id}", summary="Get a role")
async def get_role(
    role_id: uuid.UUID,
    actor: CurrentUser = Depends(require("role.manage")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    role, perms = await RoleService(session, actor.tenant_id).get_detail(role_id)
    return success(_role_read(role, perms))


@router.patch("/roles/{role_id}", summary="Update a role")
async def update_role(
    role_id: uuid.UUID, body: RoleUpdate,
    actor: CurrentUser = Depends(require("role.manage")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    role, perms = await RoleService(session, actor.tenant_id).update(
        role_id, name=body.name, description=body.description, version=body.version, actor=actor)
    return success(_role_read(role, perms))


@router.delete("/roles/{role_id}", summary="Delete a role (system roles protected)")
async def delete_role(
    role_id: uuid.UUID,
    actor: CurrentUser = Depends(require("role.manage")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    await RoleService(session, actor.tenant_id).delete(role_id, actor=actor)
    return success(MessageResponse(message="Role deleted").model_dump())


@router.put("/roles/{role_id}/permissions", summary="Set a role's permissions")
async def set_role_permissions(
    role_id: uuid.UUID, body: RolePermissionsUpdate,
    actor: CurrentUser = Depends(require("role.manage")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    role, perms = await RoleService(session, actor.tenant_id).set_permissions(
        role_id, body.permission_ids, actor=actor)
    return success(_role_read(role, perms))


# ── permissions ──────────────────────────────────────────────────────────────
@router.get("/permissions", summary="List the permission catalog")
async def list_permissions(
    actor: CurrentUser = Depends(require("role.manage")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    rows = await PermissionService(session).list()
    return success([PermissionRead.model_validate(p).model_dump() for p in rows])


# ── feature flags ────────────────────────────────────────────────────────────
@router.get("/feature-flags", summary="List effective feature flags")
async def list_flags(
    current: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    flags = await FeatureFlagService(session, current.tenant_id).list()
    return success([
        {"key": f.key, "enabled": f.enabled, "role_scope": f.role_scope, "rollout_pct": f.rollout_pct}
        for f in flags
    ])


@router.put("/feature-flags", summary="Create/update a feature flag")
async def upsert_flag(
    body: FeatureFlagUpsert,
    actor: CurrentUser = Depends(require("flag.manage")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    flag = await FeatureFlagService(session, actor.tenant_id).upsert(
        key=body.key, enabled=body.enabled, role_scope=body.role_scope,
        rollout_pct=body.rollout_pct, actor=actor)
    return success({"key": flag.key, "enabled": flag.enabled,
                    "role_scope": flag.role_scope, "rollout_pct": flag.rollout_pct})
