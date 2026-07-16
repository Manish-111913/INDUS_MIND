"""Settings repository (docs/05 S1).

Definitions are global; values are looked up by (scope, scope_id). Value writes
are tenant-scoped so one tenant can never read/write another's overrides.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.settings.models import SettingDefinition, SettingValue


class SettingsRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = uuid.UUID(str(tenant_id)) if not isinstance(tenant_id, uuid.UUID) else tenant_id

    async def definitions(self) -> list[SettingDefinition]:
        rows = (await self.session.execute(
            select(SettingDefinition).order_by(SettingDefinition.category, SettingDefinition.key)
        )).scalars().all()
        return list(rows)

    async def definition_by_key(self, key: str) -> SettingDefinition | None:
        return (await self.session.execute(
            select(SettingDefinition).where(SettingDefinition.key == key)
        )).scalar_one_or_none()

    async def values_for(self, scope: str, scope_id: uuid.UUID | str | None) -> list[SettingValue]:
        stmt = select(SettingValue).where(
            SettingValue.tenant_id == self.tenant_id, SettingValue.scope == scope
        )
        stmt = stmt.where(SettingValue.scope_id == scope_id) if scope_id is not None \
            else stmt.where(SettingValue.scope_id.is_(None))
        return list((await self.session.execute(stmt)).scalars().all())

    async def get_value(self, definition_id: uuid.UUID, scope: str,
                        scope_id: uuid.UUID | str | None) -> SettingValue | None:
        stmt = select(SettingValue).where(
            SettingValue.tenant_id == self.tenant_id,
            SettingValue.definition_id == definition_id, SettingValue.scope == scope,
        )
        stmt = stmt.where(SettingValue.scope_id == scope_id) if scope_id is not None \
            else stmt.where(SettingValue.scope_id.is_(None))
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def add(self, row: SettingValue) -> SettingValue:
        row.tenant_id = self.tenant_id
        self.session.add(row)
        await self.session.flush()
        return row
