"""Lookup service (docs/02 §27). Reads are tenant+global merged; writes are tenant-scoped."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFound, VersionMismatch
from app.modules.audit.service import AuditService
from app.modules.lookups.models import Lookup
from app.modules.lookups.repository import LookupRepository


class LookupService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str | None = None) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = LookupRepository(session, tenant_id)
        self.audit = AuditService(session)

    async def by_category(self, category: str) -> list[Lookup]:
        return await self.repo.by_category(category)

    async def get(self, lookup_id: uuid.UUID) -> Lookup:
        row = await self.repo.get(lookup_id)
        if row is None:
            raise NotFound("Lookup not found", code="LOOKUP_NOT_FOUND")
        return row

    async def create(self, *, category: str, code: str, label: str, sort: int,
                     meta: dict, active: bool, actor) -> Lookup:
        if await self.repo.find(self.tenant_id, category, code) is not None:
            raise ConflictError("Lookup code already exists in category", code="LOOKUP_CODE_TAKEN")
        row = await self.repo.add(Lookup(
            tenant_id=self.tenant_id, category=category, code=code, label=label,
            sort=sort, meta=meta, active=active, created_by=actor.id, updated_by=actor.id,
        ))
        await self.audit.write(action="lookup.create", entity_type="lookup", entity_id=row.id,
                               tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"category": category, "code": code})
        return row

    async def update(self, lookup_id: uuid.UUID, *, data, actor) -> Lookup:
        row = await self.get(lookup_id)
        if data.version is not None and row.version != data.version:
            raise VersionMismatch()
        before = {"label": row.label, "active": row.active}
        if data.label is not None:
            row.label = data.label
        if data.sort is not None:
            row.sort = data.sort
        if data.meta is not None:
            row.meta = data.meta
        if data.active is not None:
            row.active = data.active
        row.version += 1
        row.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="lookup.update", entity_type="lookup", entity_id=row.id,
                               tenant_id=self.tenant_id, actor_id=actor.id, before=before)
        return row

    async def delete(self, lookup_id: uuid.UUID, *, actor) -> None:
        from sqlalchemy import func

        row = await self.get(lookup_id)
        row.deleted_at = func.now()
        row.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="lookup.delete", entity_type="lookup", entity_id=row.id,
                               tenant_id=self.tenant_id, actor_id=actor.id)
