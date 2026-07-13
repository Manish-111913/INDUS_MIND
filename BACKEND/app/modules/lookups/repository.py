"""Lookup repository (docs/02 §7, §27).

Reads merge global (tenant_id NULL) defaults with tenant-specific rows; a tenant
row overrides a global with the same (category, code).
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.lookups.models import Lookup


class LookupRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str | None = None) -> None:
        self.session = session
        self.tenant_id = tenant_id

    async def by_category(self, category: str, *, active_only: bool = True) -> list[Lookup]:
        stmt = select(Lookup).where(
            Lookup.category == category, Lookup.deleted_at.is_(None)
        )
        if self.tenant_id is not None:
            stmt = stmt.where(
                (Lookup.tenant_id == self.tenant_id) | (Lookup.tenant_id.is_(None))
            )
        else:
            stmt = stmt.where(Lookup.tenant_id.is_(None))
        if active_only:
            stmt = stmt.where(Lookup.active.is_(True))
        rows = list((await self.session.execute(stmt.order_by(Lookup.sort, Lookup.label))).scalars().all())
        merged: dict[str, Lookup] = {}
        for row in rows:
            if row.code not in merged or row.tenant_id is not None:
                merged[row.code] = row
        return sorted(merged.values(), key=lambda r: (r.sort, r.label))

    async def categories(self) -> list[str]:
        stmt = select(Lookup.category).where(Lookup.deleted_at.is_(None)).distinct()
        return sorted((await self.session.execute(stmt)).scalars().all())

    async def get(self, lookup_id: uuid.UUID | str) -> Lookup | None:
        stmt = select(Lookup).where(Lookup.id == lookup_id, Lookup.deleted_at.is_(None))
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def find(self, tenant_id: uuid.UUID | str | None, category: str, code: str) -> Lookup | None:
        stmt = select(Lookup).where(Lookup.category == category, Lookup.code == code)
        stmt = stmt.where(Lookup.tenant_id == tenant_id) if tenant_id is not None else stmt.where(
            Lookup.tenant_id.is_(None)
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def add(self, row: Lookup) -> Lookup:
        self.session.add(row)
        await self.session.flush()
        return row
