"""Audit repository — insert only (append-only table, docs/02 §25)."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models import AuditLog


class AuditRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, row: AuditLog) -> AuditLog:
        self.session.add(row)
        await self.session.flush()
        return row
