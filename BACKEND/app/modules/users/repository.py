"""RBAC repositories: roles, permissions, role_permissions, user_roles, flags.

Tenant scoping is applied explicitly here (roles/flags are per-tenant;
permissions are global). All joins stay within this module's own tables plus a
by-id filter on user_roles.user_id (docs/02 §2 — no cross-module joins).
"""

from __future__ import annotations

import builtins  # `list` is shadowed by a `list()` method below
import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams, PageResult, paginate
from app.modules.auth.models import User
from app.modules.users.models import (
    FeatureFlag,
    Permission,
    Role,
    RolePermission,
    UserRole,
)


class PermissionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_all(self) -> list[Permission]:
        stmt = select(Permission).order_by(Permission.resource, Permission.action)
        return list((await self.session.execute(stmt)).scalars().all())

    async def get_by_code(self, code: str) -> Permission | None:
        return (
            await self.session.execute(select(Permission).where(Permission.code == code))
        ).scalar_one_or_none()

    async def get_many(self, ids: list[uuid.UUID]) -> list[Permission]:
        if not ids:
            return []
        stmt = select(Permission).where(Permission.id.in_(ids))
        return list((await self.session.execute(stmt)).scalars().all())

    async def add(self, perm: Permission) -> Permission:
        self.session.add(perm)
        await self.session.flush()
        return perm


class RoleRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    async def get(self, role_id: uuid.UUID | str) -> Role | None:
        stmt = select(Role).where(
            Role.id == role_id, Role.tenant_id == self.tenant_id, Role.deleted_at.is_(None)
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def get_by_name(self, name: str) -> Role | None:
        stmt = select(Role).where(
            Role.name == name, Role.tenant_id == self.tenant_id, Role.deleted_at.is_(None)
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list(self) -> list[Role]:
        stmt = (
            select(Role)
            .where(Role.tenant_id == self.tenant_id, Role.deleted_at.is_(None))
            .order_by(Role.name)
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def add(self, role: Role) -> Role:
        role.tenant_id = self.tenant_id  # type: ignore[assignment]
        self.session.add(role)
        await self.session.flush()
        return role

    async def permission_codes(self, role_id: uuid.UUID | str) -> builtins.list[str]:
        stmt = (
            select(Permission.code)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .where(RolePermission.role_id == role_id)
            .order_by(Permission.code)
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def set_permissions(self, role_id: uuid.UUID | str, permission_ids: builtins.list[uuid.UUID]) -> None:
        await self.session.execute(
            delete(RolePermission).where(RolePermission.role_id == role_id)
        )
        for pid in permission_ids:
            self.session.add(RolePermission(role_id=role_id, permission_id=pid))
        await self.session.flush()

    async def user_ids_with_role(self, role_id: uuid.UUID | str) -> builtins.list[uuid.UUID]:
        stmt = select(UserRole.user_id).where(UserRole.role_id == role_id)
        return list((await self.session.execute(stmt)).scalars().all())


class UserRoleRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def role_ids_for_user(self, user_id: uuid.UUID | str) -> list[uuid.UUID]:
        stmt = select(UserRole.role_id).where(UserRole.user_id == user_id)
        return list((await self.session.execute(stmt)).scalars().all())

    async def role_names_for_user(self, user_id: uuid.UUID | str, tenant_id: uuid.UUID | str) -> list[str]:
        stmt = (
            select(Role.name)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(
                UserRole.user_id == user_id,
                Role.tenant_id == tenant_id,
                Role.deleted_at.is_(None),
            )
            .order_by(Role.name)
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def set_roles(self, user_id: uuid.UUID | str, role_ids: list[uuid.UUID]) -> None:
        await self.session.execute(delete(UserRole).where(UserRole.user_id == user_id))
        for rid in role_ids:
            self.session.add(UserRole(user_id=user_id, role_id=rid))
        await self.session.flush()

    async def effective_permission_codes(
        self, user_id: uuid.UUID | str, tenant_id: uuid.UUID | str
    ) -> set[str]:
        stmt = (
            select(Permission.code)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .join(Role, Role.id == RolePermission.role_id)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(
                UserRole.user_id == user_id,
                Role.tenant_id == tenant_id,
                Role.deleted_at.is_(None),
            )
        )
        return set((await self.session.execute(stmt)).scalars().all())


class UserAdminRepository:
    """User listing/lookup for the management API (User table owned by auth)."""

    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    async def get(self, user_id: uuid.UUID | str) -> User | None:
        stmt = select(User).where(
            User.id == user_id, User.tenant_id == self.tenant_id, User.deleted_at.is_(None)
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list(self, params: PageParams, *, status: str | None, role_id: uuid.UUID | None) -> PageResult:
        stmt = select(User).where(User.tenant_id == self.tenant_id, User.deleted_at.is_(None))
        if status:
            stmt = stmt.where(User.status == status)
        if role_id:
            stmt = stmt.join(UserRole, UserRole.user_id == User.id).where(UserRole.role_id == role_id)
        return await paginate(self.session, stmt, params, User)


class FeatureFlagRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_for_tenant(self, tenant_id: uuid.UUID | str) -> list[FeatureFlag]:
        # Global (tenant_id NULL) + tenant-specific; tenant rows override globals by key.
        stmt = select(FeatureFlag).where(
            (FeatureFlag.tenant_id == tenant_id) | (FeatureFlag.tenant_id.is_(None))
        )
        rows = list((await self.session.execute(stmt)).scalars().all())
        merged: dict[str, FeatureFlag] = {}
        for row in rows:
            if row.key not in merged or row.tenant_id is not None:
                merged[row.key] = row
        return list(merged.values())

    async def get(self, tenant_id: uuid.UUID | str, key: str) -> FeatureFlag | None:
        stmt = select(FeatureFlag).where(
            FeatureFlag.tenant_id == tenant_id, FeatureFlag.key == key
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def add(self, flag: FeatureFlag) -> FeatureFlag:
        self.session.add(flag)
        await self.session.flush()
        return flag
