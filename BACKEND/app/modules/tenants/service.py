"""Tenant service — interface other modules call (no cross-module joins, docs/02 §2)."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFound
from app.modules.tenants.models import Tenant
from app.modules.tenants.repository import TenantRepository


class TenantService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = TenantRepository(session)

    async def get(self, tenant_id: uuid.UUID | str) -> Tenant:
        tenant = await self.repo.get(tenant_id)
        if tenant is None:
            raise NotFound("Tenant not found", code="TENANT_NOT_FOUND")
        return tenant

    async def get_by_slug(self, slug: str) -> Tenant | None:
        return await self.repo.get_by_slug(slug)

    async def create(self, *, name: str, slug: str, plan: str = "free") -> Tenant:
        if await self.repo.get_by_slug(slug) is not None:
            raise ConflictError("Tenant slug already exists", code="TENANT_SLUG_TAKEN")
        return await self.repo.add(Tenant(name=name, slug=slug, plan=plan))

    async def create_and_initialize_tenant(self, *, name: str, slug: str, plan: str = "free") -> Tenant:
        """Create a new tenant and initialize it with system-only roles/configs, leaving data empty."""
        if await self.repo.get_by_slug(slug) is not None:
            raise ConflictError("Tenant slug already exists", code="TENANT_SLUG_TAKEN")
        tenant = await self.repo.add(Tenant(name=name, slug=slug, plan=plan))

        from seeds.seed import (
            _seed_roles,
            _seed_flags,
            _seed_dashboards,
            _seed_retention,
            _seed_permissions,
            _seed_extraction_rules,
        )

        perms = await _seed_permissions(self.session)
        roles = await _seed_roles(self.session, tenant, perms)
        await _seed_flags(self.session, tenant)
        await _seed_dashboards(self.session, tenant, roles)
        await _seed_retention(self.session, tenant)
        await _seed_extraction_rules(self.session, tenant)

        return tenant

