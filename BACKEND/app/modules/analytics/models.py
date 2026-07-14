"""Analytics models: report_definitions, scheduled_reports (docs/02 §7, §22).

`report_definitions` are config-driven: `sql_template` is admin/seed-authored,
whitelisted SELECT-only SQL with named bind params (`:tenant` always injected);
users supply only bound param *values*, validated against `params_schema`.
`scheduled_reports` drive the beat that emails a report on a cron.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.common.base import AuditFieldsMixin, Base, SoftDeleteMixin, TenantMixin, VersionMixin


class ReportDefinition(Base, AuditFieldsMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "report_definitions"

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True, index=True)
    key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(48), nullable=True)
    sql_template: Mapped[str] = mapped_column(Text, nullable=False)
    params_schema: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    chart_config: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    required_permission: Mapped[str | None] = mapped_column(String(64), nullable=True)


class ScheduledReport(Base, TenantMixin, AuditFieldsMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "scheduled_reports"

    report_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("report_definitions.id", ondelete="CASCADE"),
        nullable=False, index=True)
    cron: Mapped[str] = mapped_column(String(64), nullable=False)
    recipients: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    params: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    format: Mapped[str] = mapped_column(String(8), nullable=False, server_default="xlsx")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
