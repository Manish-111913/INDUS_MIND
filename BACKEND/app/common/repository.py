"""Base repository — automatic tenant + soft-delete filtering (docs/02 §6, §7).

Every query built through `self._base_select()` is scoped to the active tenant
and excludes soft-deleted rows unless explicitly asked. Concrete module
repositories subclass this and add their own query methods; they never write raw
tenant filters by hand (defence-in-depth alongside Postgres RLS).
"""

from __future__ import annotations

import uuid
from typing import Generic, TypeVar

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.base import Base
from app.common.pagination import PageParams, PageResult, paginate
from app.core.exceptions import VersionMismatch

M = TypeVar("M", bound=Base)


class BaseRepository(Generic[M]):
    model: type[M]

    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = uuid.UUID(str(tenant_id)) if not isinstance(tenant_id, uuid.UUID) else tenant_id

    # ── query builders ───────────────────────────────────────────────────────
    def _base_select(self, *, include_deleted: bool = False) -> Select:
        stmt: Select = select(self.model)
        if hasattr(self.model, "tenant_id"):
            stmt = stmt.where(self.model.tenant_id == self.tenant_id)
        if not include_deleted and hasattr(self.model, "deleted_at"):
            stmt = stmt.where(self.model.deleted_at.is_(None))
        return stmt

    async def get(self, id_: uuid.UUID | str, *, include_deleted: bool = False) -> M | None:
        stmt = self._base_select(include_deleted=include_deleted).where(self.model.id == id_)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list(self, params: PageParams) -> PageResult:
        return await paginate(self.session, self._base_select(), params, self.model)

    # ── mutations ──────────────────────────────────────────────────────────
    async def add(self, entity: M) -> M:
        if hasattr(entity, "tenant_id") and getattr(entity, "tenant_id", None) is None:
            entity.tenant_id = self.tenant_id  # type: ignore[attr-defined]
        self.session.add(entity)
        await self.session.flush()
        return entity

    async def soft_delete(self, entity: M) -> None:
        if not hasattr(entity, "deleted_at"):
            raise TypeError(f"{self.model.__name__} is not soft-deletable")
        from sqlalchemy import func

        entity.deleted_at = func.now()  # type: ignore[attr-defined]
        await self.session.flush()

    def check_version(self, entity: M, expected: int | None) -> None:
        """Optimistic-lock guard for PATCH (docs/02 §14)."""
        if expected is None or not hasattr(entity, "version"):
            return
        if entity.version != expected:
            raise VersionMismatch()
