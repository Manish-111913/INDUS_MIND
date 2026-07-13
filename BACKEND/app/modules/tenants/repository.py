"""Tenant repository (docs/02 §7).

Not tenant-scoped (the tenant *is* the scope), so it uses the session directly
rather than BaseRepository's tenant auto-filter.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.tenants.models import Tenant


class TenantRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, tenant_id: uuid.UUID | str) -> Tenant | None:
        stmt = select(Tenant).where(Tenant.id == tenant_id, Tenant.deleted_at.is_(None))
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def get_by_slug(self, slug: str) -> Tenant | None:
        stmt = select(Tenant).where(Tenant.slug == slug, Tenant.deleted_at.is_(None))
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def add(self, tenant: Tenant) -> Tenant:
        self.session.add(tenant)
        await self.session.flush()
        return tenant
