"""Import / export / reporting models (docs/05 S6).

`import_jobs` tracks a CSV/XLSX ingest through validate → preview → apply.
`export_jobs` tracks an async table export. `report_templates` reference a named
query builder (never raw SQL from the DB), rendered on a cron by `report_schedules`
into `report_runs`.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.common.base import AuditFieldsMixin, Base, SoftDeleteMixin, TenantMixin

# Status vocabularies. Kept as plain tuples (not PG enums) so adding a state is a
# code change, not a migration — the app is the only writer. The importable
# entity list is NOT duplicated here: it derives from the import registry
# (`import_registry.IMPORT_ENTITIES`) so the two can never drift.
IMPORT_STATUSES = ("validating", "preview", "applying", "done", "failed")
EXPORT_STATUSES = ("pending", "processing", "done", "failed")


class ImportJob(Base, TenantMixin, AuditFieldsMixin):
    __tablename__ = "import_jobs"

    entity: Mapped[str] = mapped_column(String(32), nullable=False)
    file_key: Mapped[str] = mapped_column(String(512), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="validating")
    mapping: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    preview: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    total_rows: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    ok_rows: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    error_rows: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    error_report_key: Mapped[str | None] = mapped_column(String(512), nullable=True)


class ExportJob(Base, TenantMixin, AuditFieldsMixin):
    __tablename__ = "export_jobs"

    entity: Mapped[str] = mapped_column(String(48), nullable=False)
    filters: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    columns: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    format: Mapped[str] = mapped_column(String(8), nullable=False, server_default="csv")
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="pending")
    file_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")


class ReportTemplate(Base, AuditFieldsMixin, SoftDeleteMixin):
    __tablename__ = "report_templates"

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True, index=True)
    code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # query_def references a named query builder + params — never raw SQL.
    query_def: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    layout: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    output: Mapped[str] = mapped_column(String(8), nullable=False, server_default="pdf")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")


class ReportSchedule(Base, TenantMixin, AuditFieldsMixin, SoftDeleteMixin):
    __tablename__ = "report_schedules"

    template_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("report_templates.id", ondelete="CASCADE"),
        nullable=False, index=True)
    cron_expr: Mapped[str] = mapped_column(String(64), nullable=False)
    recipients: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    locale: Mapped[str] = mapped_column(String(16), nullable=False, server_default="en")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ReportRun(Base, TenantMixin, AuditFieldsMixin):
    __tablename__ = "report_runs"

    template_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("report_templates.id", ondelete="CASCADE"),
        nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="done")
    file_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    params: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
