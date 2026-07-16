"""Preferences repository (docs/05 S2)."""

from __future__ import annotations

import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.preferences.models import SavedView, UserPreference


class PreferenceRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    async def get(self, user_id: uuid.UUID, key: str) -> UserPreference | None:
        return (await self.session.execute(
            select(UserPreference).where(
                UserPreference.tenant_id == self.tenant_id,
                UserPreference.user_id == user_id, UserPreference.key == key)
        )).scalar_one_or_none()

    async def upsert(self, user_id: uuid.UUID, key: str, value) -> UserPreference:
        row = await self.get(user_id, key)
        if row is None:
            row = UserPreference(tenant_id=self.tenant_id, user_id=user_id, key=key, value=value,
                                 created_by=user_id, updated_by=user_id)
            self.session.add(row)
        else:
            row.value = value
            row.updated_by = user_id
        await self.session.flush()
        return row


class SavedViewRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    async def list(self, user_id: uuid.UUID, entity: str | None) -> list[SavedView]:
        # Own views + shared views tenant-wide.
        stmt = select(SavedView).where(
            SavedView.tenant_id == self.tenant_id, SavedView.deleted_at.is_(None),
            or_(SavedView.user_id == user_id, SavedView.is_shared.is_(True)),
        )
        if entity is not None:
            stmt = stmt.where(SavedView.entity == entity)
        return list((await self.session.execute(
            stmt.order_by(SavedView.entity, SavedView.name))).scalars().all())

    async def get(self, view_id: uuid.UUID) -> SavedView | None:
        return (await self.session.execute(
            select(SavedView).where(
                SavedView.tenant_id == self.tenant_id, SavedView.id == view_id,
                SavedView.deleted_at.is_(None))
        )).scalar_one_or_none()

    async def clear_default(self, user_id: uuid.UUID, entity: str) -> None:
        for row in (await self.session.execute(
            select(SavedView).where(
                SavedView.tenant_id == self.tenant_id, SavedView.user_id == user_id,
                SavedView.entity == entity, SavedView.is_default.is_(True),
                SavedView.deleted_at.is_(None))
        )).scalars().all():
            row.is_default = False
        await self.session.flush()

    async def add(self, row: SavedView) -> SavedView:
        self.session.add(row)
        await self.session.flush()
        return row
