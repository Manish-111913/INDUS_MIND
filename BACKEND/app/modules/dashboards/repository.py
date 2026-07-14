"""Dashboard repositories (docs/02 §7, §21)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.dashboards.models import DashboardConfig, WidgetRegistry


class WidgetRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def all(self) -> list[WidgetRegistry]:
        return list((await self.session.execute(
            select(WidgetRegistry).order_by(WidgetRegistry.key))).scalars().all())

    async def get(self, key: str) -> WidgetRegistry | None:
        return (await self.session.execute(
            select(WidgetRegistry).where(WidgetRegistry.key == key))).scalar_one_or_none()


class DashboardConfigRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    async def for_role(self, role_id: uuid.UUID | str) -> DashboardConfig | None:
        return (await self.session.execute(select(DashboardConfig).where(
            DashboardConfig.tenant_id == self.tenant_id, DashboardConfig.role_id == role_id,
            DashboardConfig.user_id.is_(None), DashboardConfig.deleted_at.is_(None)))
        ).scalars().first()

    async def for_user(self, user_id: uuid.UUID | str) -> DashboardConfig | None:
        return (await self.session.execute(select(DashboardConfig).where(
            DashboardConfig.tenant_id == self.tenant_id, DashboardConfig.user_id == user_id,
            DashboardConfig.deleted_at.is_(None)))).scalars().first()

    async def add(self, config: DashboardConfig) -> DashboardConfig:
        config.tenant_id = self.tenant_id  # type: ignore[assignment]
        self.session.add(config)
        await self.session.flush()
        return config
