"""Preferences service (docs/05 S2).

Preference upsert is per-user and unconditional. Saved views are owner-writable;
shared views are readable tenant-wide but mutable only by the owner or a caller
holding `views.manage`. Setting a view as default clears any prior default for
that (user, entity) pair.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFound, PermissionDenied
from app.modules.preferences.models import SavedView
from app.modules.preferences.repository import PreferenceRepository, SavedViewRepository


class PreferenceService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = PreferenceRepository(session, tenant_id)

    async def get(self, user_id: uuid.UUID, key: str) -> Any:
        row = await self.repo.get(user_id, key)
        return row.value if row is not None else None

    async def set(self, user_id: uuid.UUID, key: str, value: Any) -> Any:
        row = await self.repo.upsert(user_id, key, value)
        return row.value


class SavedViewService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = SavedViewRepository(session, tenant_id)

    async def list(self, user_id: uuid.UUID, entity: str | None) -> list[SavedView]:
        return await self.repo.list(user_id, entity)

    async def create(self, *, actor, data) -> SavedView:
        if data.is_default:
            await self.repo.clear_default(actor.id, data.entity)
        return await self.repo.add(SavedView(
            tenant_id=self.tenant_id, user_id=actor.id, entity=data.entity, name=data.name,
            filters=data.filters, columns=data.columns, sort=data.sort,
            is_shared=data.is_shared, is_default=data.is_default,
            created_by=actor.id, updated_by=actor.id))

    async def update(self, view_id: uuid.UUID, *, actor, data) -> SavedView:
        row = await self._editable(view_id, actor)
        if data.name is not None:
            row.name = data.name
        if data.filters is not None:
            row.filters = data.filters
        if data.columns is not None:
            row.columns = data.columns
        if data.sort is not None:
            row.sort = data.sort
        if data.is_shared is not None:
            row.is_shared = data.is_shared
        if data.is_default is not None:
            if data.is_default:
                await self.repo.clear_default(row.user_id, row.entity)
            row.is_default = data.is_default
        row.updated_by = actor.id
        await self.session.flush()
        return row

    async def delete(self, view_id: uuid.UUID, *, actor) -> None:
        row = await self._editable(view_id, actor)
        row.deleted_at = func.now()
        row.updated_by = actor.id
        await self.session.flush()

    async def _editable(self, view_id: uuid.UUID, actor) -> SavedView:
        row = await self.repo.get(view_id)
        if row is None:
            raise NotFound("Saved view not found", code="SAVED_VIEW_NOT_FOUND")
        if row.user_id != actor.id and "views.manage" not in actor.perms:
            raise PermissionDenied("Not the owner of this view")
        return row
