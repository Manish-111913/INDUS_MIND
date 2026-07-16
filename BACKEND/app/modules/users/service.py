"""Users / roles / permissions services (docs/02 §6, §24, §25).

No business logic in routers. Every mutation writes an audit_log row and, where
it changes access, recomputes + re-caches the affected users' effective
permissions and bumps their token_version so stale JWTs are forced to refresh
(docs/02 §6). Also exposes `compute_effective_permissions`, the lazy resolver
the auth layer calls on a permission-cache miss.
"""

from __future__ import annotations

import builtins  # `list` is shadowed by a `list()` method below
import secrets
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams, PageResult
from app.core.config import settings
from app.core.email import send_email
from app.core.events import Event, EventType, bus
from app.core.exceptions import ConflictError, NotFound
from app.core.redis import get_redis
from app.core.security import hash_password
from app.modules.audit.service import AuditService
from app.modules.auth import permissions as perm_cache
from app.modules.auth.models import User
from app.modules.auth.repository import UserRepository
from app.modules.users.models import FeatureFlag, Role
from app.modules.users.repository import (
    FeatureFlagRepository,
    PermissionRepository,
    RoleRepository,
    UserAdminRepository,
    UserRoleRepository,
)

INVITE_TTL = 7 * 24 * 60 * 60  # 7 days


async def compute_effective_permissions(
    session: AsyncSession, tenant_id: uuid.UUID | str, user_id: uuid.UUID | str
) -> set[str]:
    """Resolve a user's effective permission set from the role graph."""
    return await UserRoleRepository(session).effective_permission_codes(user_id, tenant_id)


async def refresh_user_permissions(
    session: AsyncSession, tenant_id: uuid.UUID | str, user_id: uuid.UUID | str
) -> set[str]:
    perms = await compute_effective_permissions(session, tenant_id, user_id)
    await perm_cache.set_effective_permissions(tenant_id, user_id, perms)
    return perms


class PermissionService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = PermissionRepository(session)

    async def list(self):
        return await self.repo.list_all()


class RoleService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = RoleRepository(session, tenant_id)
        self.perms = PermissionRepository(session)
        self.audit = AuditService(session)

    async def list(self) -> list[tuple[Role, list[str]]]:
        roles = await self.repo.list()
        return [(r, await self.repo.permission_codes(r.id)) for r in roles]

    async def get_detail(self, role_id: uuid.UUID) -> tuple[Role, builtins.list[str]]:
        role = await self.repo.get(role_id)
        if role is None:
            raise NotFound("Role not found", code="ROLE_NOT_FOUND")
        return role, await self.repo.permission_codes(role.id)

    async def create(self, *, name: str, description: str | None,
                     permission_ids: builtins.list[uuid.UUID], actor) -> tuple[Role, builtins.list[str]]:
        if await self.repo.get_by_name(name) is not None:
            raise ConflictError("Role name already exists", code="ROLE_NAME_TAKEN")
        role = await self.repo.add(Role(name=name, description=description, is_system=False,
                                        created_by=actor.id, updated_by=actor.id))
        if permission_ids:
            await self.repo.set_permissions(role.id, permission_ids)
        await self.audit.write(action="role.create", entity_type="role", entity_id=role.id,
                               tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"name": name})
        return role, await self.repo.permission_codes(role.id)

    async def update(self, role_id: uuid.UUID, *, name: str | None, description: str | None,
                     version: int | None, actor) -> tuple[Role, builtins.list[str]]:
        role = await self.repo.get(role_id)
        if role is None:
            raise NotFound("Role not found", code="ROLE_NOT_FOUND")
        _check_version(role, version)
        before = {"name": role.name, "description": role.description}
        if name and name != role.name:
            if await self.repo.get_by_name(name) is not None:
                raise ConflictError("Role name already exists", code="ROLE_NAME_TAKEN")
            role.name = name
        if description is not None:
            role.description = description
        role.version += 1
        role.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="role.update", entity_type="role", entity_id=role.id,
                               tenant_id=self.tenant_id, actor_id=actor.id,
                               before=before, after={"name": role.name})
        return role, await self.repo.permission_codes(role.id)

    async def delete(self, role_id: uuid.UUID, *, actor) -> None:
        role = await self.repo.get(role_id)
        if role is None:
            raise NotFound("Role not found", code="ROLE_NOT_FOUND")
        if role.is_system:
            raise ConflictError("System roles cannot be deleted", code="ROLE_IS_SYSTEM")
        from sqlalchemy import func

        affected = await self.repo.user_ids_with_role(role.id)
        role.deleted_at = func.now()
        role.updated_by = actor.id
        await self.session.flush()
        await self._reindex_users(affected)
        await self.audit.write(action="role.delete", entity_type="role", entity_id=role.id,
                               tenant_id=self.tenant_id, actor_id=actor.id)

    async def set_permissions(self, role_id: uuid.UUID, permission_ids: builtins.list[uuid.UUID],
                              *, actor) -> tuple[Role, builtins.list[str]]:
        role = await self.repo.get(role_id)
        if role is None:
            raise NotFound("Role not found", code="ROLE_NOT_FOUND")
        found = await self.perms.get_many(permission_ids)
        if len(found) != len(set(permission_ids)):
            raise NotFound("One or more permissions not found", code="PERMISSION_NOT_FOUND")
        before = await self.repo.permission_codes(role.id)
        await self.repo.set_permissions(role.id, permission_ids)
        affected = await self.repo.user_ids_with_role(role.id)
        await self._reindex_users(affected)
        after = await self.repo.permission_codes(role.id)
        await self.audit.write(action="role.set_permissions", entity_type="role", entity_id=role.id,
                               tenant_id=self.tenant_id, actor_id=actor.id,
                               before={"permissions": before}, after={"permissions": after})
        await bus.publish(Event(EventType.USER_ROLE_CHANGED, tenant_id=str(self.tenant_id),
                                actor_id=str(actor.id), payload={"role_id": str(role.id)}))
        return role, after

    async def _reindex_users(self, user_ids: builtins.list[uuid.UUID]) -> None:
        """Recompute + re-cache perms and force-refresh tokens for affected users."""
        users_repo = UserRepository(self.session)
        for uid in user_ids:
            await refresh_user_permissions(self.session, self.tenant_id, uid)
            await users_repo.bump_token_version(uid)


class UserService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = UserAdminRepository(session, tenant_id)
        self.users = UserRepository(session)
        self.user_roles = UserRoleRepository(session)
        self.audit = AuditService(session)

    async def _roles(self, user_id: uuid.UUID) -> list[str]:
        return await self.user_roles.role_names_for_user(user_id, self.tenant_id)

    async def list(self, params: PageParams, *, status: str | None,
                   role_id: uuid.UUID | None) -> tuple[PageResult, dict[uuid.UUID, list[str]]]:
        page = await self.repo.list(params, status=status, role_id=role_id)
        roles = {u.id: await self._roles(u.id) for u in page.items}
        return page, roles

    async def get(self, user_id: uuid.UUID) -> tuple[User, builtins.list[str]]:
        user = await self.repo.get(user_id)
        if user is None:
            raise NotFound("User not found", code="USER_NOT_FOUND")
        return user, await self._roles(user.id)

    async def create(self, *, email: str, full_name: str, password: str, phone: str | None,
                     role_ids: builtins.list[uuid.UUID], actor) -> tuple[User, builtins.list[str]]:
        if await self.users.get_by_email(self.tenant_id, email) is not None:
            raise ConflictError("Email already in use", code="EMAIL_TAKEN")
        user = await self.users.add(User(
            tenant_id=self.tenant_id, email=email, full_name=full_name, phone=phone,
            password_hash=hash_password(password), status="active",
            created_by=actor.id, updated_by=actor.id,
        ))
        if role_ids:
            await self.user_roles.set_roles(user.id, role_ids)
        await refresh_user_permissions(self.session, self.tenant_id, user.id)
        await self.audit.write(action="user.create", entity_type="user", entity_id=user.id,
                               tenant_id=self.tenant_id, actor_id=actor.id, after={"email": email})
        return user, await self._roles(user.id)

    async def invite(self, *, email: str, full_name: str, role_ids: builtins.list[uuid.UUID],
                     actor) -> tuple[User, builtins.list[str]]:
        if await self.users.get_by_email(self.tenant_id, email) is not None:
            raise ConflictError("Email already in use", code="EMAIL_TAKEN")
        user = await self.users.add(User(
            tenant_id=self.tenant_id, email=email, full_name=full_name,
            password_hash=None, status="invited",
            created_by=actor.id, updated_by=actor.id,
        ))
        if role_ids:
            await self.user_roles.set_roles(user.id, role_ids)
        await refresh_user_permissions(self.session, self.tenant_id, user.id)
        token = secrets.token_urlsafe(32)
        await get_redis().set(f"auth:reset:{token}", str(user.id), ex=INVITE_TTL)
        link = f"{settings.frontend_url}/reset-password?token={token}"
        await send_email(email, "You're invited to IndusMind",
                         f"Set your password to activate your account:\n{link}\n")
        await self.audit.write(action="user.invite", entity_type="user", entity_id=user.id,
                               tenant_id=self.tenant_id, actor_id=actor.id, after={"email": email})
        return user, await self._roles(user.id)

    async def update(self, user_id: uuid.UUID, *, data, actor) -> tuple[User, builtins.list[str]]:
        user = await self.repo.get(user_id)
        if user is None:
            raise NotFound("User not found", code="USER_NOT_FOUND")
        _check_version(user, data.version)
        before = {"full_name": user.full_name, "status": user.status}
        if data.full_name is not None:
            user.full_name = data.full_name
        if data.phone is not None:
            user.phone = data.phone
        if data.locale is not None:
            user.locale = data.locale
        if data.theme is not None:
            user.theme = data.theme
        if data.role_ids is not None:
            await self.user_roles.set_roles(user.id, data.role_ids)
            await refresh_user_permissions(self.session, self.tenant_id, user.id)
            await self.users.bump_token_version(user.id)
            await bus.publish(Event(EventType.USER_ROLE_CHANGED, tenant_id=str(self.tenant_id),
                                    actor_id=str(actor.id), payload={"user_id": str(user.id)}))
        user.version += 1
        user.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="user.update", entity_type="user", entity_id=user.id,
                               tenant_id=self.tenant_id, actor_id=actor.id,
                               before=before, after={"full_name": user.full_name})
        return user, await self._roles(user.id)

    async def set_status(self, user_id: uuid.UUID, *, status: str, actor) -> tuple[User, builtins.list[str]]:
        user = await self.repo.get(user_id)
        if user is None:
            raise NotFound("User not found", code="USER_NOT_FOUND")
        before = user.status
        user.status = status
        user.version += 1
        user.updated_by = actor.id
        if status != "active":
            await self.users.bump_token_version(user.id)  # kick out live sessions
        await self.session.flush()
        await self.audit.write(action=f"user.{'activate' if status == 'active' else 'deactivate'}",
                               entity_type="user", entity_id=user.id, tenant_id=self.tenant_id,
                               actor_id=actor.id, before={"status": before}, after={"status": status})
        return user, await self._roles(user.id)

    async def delete(self, user_id: uuid.UUID, *, actor) -> None:
        user = await self.repo.get(user_id)
        if user is None:
            raise NotFound("User not found", code="USER_NOT_FOUND")
        from sqlalchemy import func

        user.deleted_at = func.now()
        user.status = "disabled"
        await self.users.bump_token_version(user.id)
        await self.session.flush()
        await perm_cache.invalidate_permissions(self.tenant_id, user.id)
        await self.audit.write(action="user.delete", entity_type="user", entity_id=user.id,
                               tenant_id=self.tenant_id, actor_id=actor.id)


class FeatureFlagService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = FeatureFlagRepository(session)
        self.audit = AuditService(session)

    async def list(self) -> list[FeatureFlag]:
        return await self.repo.list_for_tenant(self.tenant_id)

    async def upsert(self, *, key: str, enabled: bool, role_scope: builtins.list[str],
                     rollout_pct: int, actor) -> FeatureFlag:
        flag = await self.repo.get(self.tenant_id, key)
        if flag is None:
            flag = await self.repo.add(FeatureFlag(
                tenant_id=self.tenant_id, key=key, enabled=enabled,
                role_scope=role_scope, rollout_pct=rollout_pct,
                created_by=actor.id, updated_by=actor.id,
            ))
        else:
            flag.enabled = enabled
            flag.role_scope = role_scope
            flag.rollout_pct = rollout_pct
            flag.updated_by = actor.id
            await self.session.flush()
        await self.audit.write(action="flag.upsert", entity_type="feature_flag", entity_id=flag.id,
                               tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"key": key, "enabled": enabled})
        return flag


async def me_context(session: AsyncSession, user: User) -> dict:
    """Roles + effective permissions + feature flags for /auth/me (docs/02 §24)."""
    roles = await UserRoleRepository(session).role_names_for_user(user.id, user.tenant_id)
    perms = await perm_cache.get_effective_permissions(user.tenant_id, user.id, session=session)
    flags = await FeatureFlagRepository(session).list_for_tenant(user.tenant_id)
    return {
        "roles": roles,
        "permissions": sorted(perms),
        "flags": [
            {"key": f.key, "enabled": f.enabled, "role_scope": f.role_scope,
             "rollout_pct": f.rollout_pct}
            for f in flags
        ],
    }


def _check_version(entity, expected: int | None) -> None:
    from app.core.exceptions import VersionMismatch

    if expected is not None and getattr(entity, "version", None) != expected:
        raise VersionMismatch()
