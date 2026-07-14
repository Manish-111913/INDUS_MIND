"""Analytics repositories (docs/02 §7, §22)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.analytics.models import ReportDefinition, ScheduledReport


class ReportRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    async def list_all(self) -> list[ReportDefinition]:
        stmt = select(ReportDefinition).where(
            ReportDefinition.deleted_at.is_(None),
            (ReportDefinition.tenant_id == self.tenant_id) | (ReportDefinition.tenant_id.is_(None)),
        ).order_by(ReportDefinition.name)
        return list((await self.session.execute(stmt)).scalars().all())

    async def get(self, report_id: uuid.UUID | str) -> ReportDefinition | None:
        stmt = select(ReportDefinition).where(
            ReportDefinition.id == report_id, ReportDefinition.deleted_at.is_(None),
            (ReportDefinition.tenant_id == self.tenant_id) | (ReportDefinition.tenant_id.is_(None)))
        return (await self.session.execute(stmt)).scalar_one_or_none()


class ScheduleRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    async def get(self, schedule_id: uuid.UUID | str) -> ScheduledReport | None:
        return (await self.session.execute(select(ScheduledReport).where(
            ScheduledReport.id == schedule_id, ScheduledReport.tenant_id == self.tenant_id,
            ScheduledReport.deleted_at.is_(None)))).scalar_one_or_none()

    async def list_active(self) -> list[ScheduledReport]:
        return list((await self.session.execute(select(ScheduledReport).where(
            ScheduledReport.tenant_id == self.tenant_id, ScheduledReport.active.is_(True),
            ScheduledReport.deleted_at.is_(None)))).scalars().all())

    async def add(self, schedule: ScheduledReport) -> ScheduledReport:
        schedule.tenant_id = self.tenant_id  # type: ignore[assignment]
        self.session.add(schedule)
        await self.session.flush()
        return schedule
