"""Audit repository — append-only: insert + read (docs/02 §25)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams, PageResult, paginate
from app.modules.audit.models import AuditLog


class AuditRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, row: AuditLog) -> AuditLog:
        self.session.add(row)
        await self.session.flush()
        return row

    async def query(
        self,
        *,
        tenant_id: uuid.UUID | str,
        params: PageParams,
        actor_id: uuid.UUID | None = None,
        action: str | None = None,
        entity_type: str | None = None,
        entity_id: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> PageResult:
        stmt = select(AuditLog).where(AuditLog.tenant_id == tenant_id)
        if actor_id:
            stmt = stmt.where(AuditLog.actor_id == actor_id)
        if action:
            stmt = stmt.where(AuditLog.action == action)
        if entity_type:
            stmt = stmt.where(AuditLog.entity_type == entity_type)
        if entity_id:
            stmt = stmt.where(AuditLog.entity_id == entity_id)
        if date_from:
            stmt = stmt.where(AuditLog.created_at >= date_from)
        if date_to:
            stmt = stmt.where(AuditLog.created_at <= date_to)
        return await paginate(self.session, stmt, params, AuditLog)

    async def for_entity(
        self, *, tenant_id: uuid.UUID | str, entity_type: str, entity_id: str, params: PageParams
    ) -> PageResult:
        stmt = select(AuditLog).where(
            AuditLog.tenant_id == tenant_id,
            AuditLog.entity_type == entity_type,
            AuditLog.entity_id == entity_id,
        )
        return await paginate(self.session, stmt, params, AuditLog)
