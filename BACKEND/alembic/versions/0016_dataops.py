"""import/export jobs + report templates/schedules/runs (docs/05 S6)

Revision ID: 0016_dataops
Revises: 0015_ai_meters
Create Date: 2026-07-14
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0016_dataops"
down_revision: str | None = "0015_ai_meters"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UUID = postgresql.UUID(as_uuid=True)


def _audit_cols() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
        sa.Column("created_by", _UUID, nullable=True),
        sa.Column("updated_by", _UUID, nullable=True),
    ]


def upgrade() -> None:
    op.create_table(
        "import_jobs",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit_cols(),
        sa.Column("entity", sa.String(32), nullable=False),
        sa.Column("file_key", sa.String(512), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="validating"),
        sa.Column("mapping", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("preview", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("total_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ok_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_report_key", sa.String(512), nullable=True),
    )
    op.create_index("ix_import_jobs_tenant_id", "import_jobs", ["tenant_id"])

    op.create_table(
        "export_jobs",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit_cols(),
        sa.Column("entity", sa.String(48), nullable=False),
        sa.Column("filters", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("columns", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("format", sa.String(8), nullable=False, server_default="csv"),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("file_key", sa.String(512), nullable=True),
        sa.Column("row_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_export_jobs_tenant_id", "export_jobs", ["tenant_id"])

    op.create_table(
        "report_templates",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        *_audit_cols(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("tenant_id", _UUID, nullable=True),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("query_def", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("layout", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("output", sa.String(8), nullable=False, server_default="pdf"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.create_index("ix_report_templates_tenant_id", "report_templates", ["tenant_id"])
    op.create_index("ix_report_templates_code", "report_templates", ["code"])

    op.create_table(
        "report_schedules",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit_cols(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("template_id", _UUID,
                  sa.ForeignKey("report_templates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cron_expr", sa.String(64), nullable=False),
        sa.Column("recipients", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("locale", sa.String(16), nullable=False, server_default="en"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_report_schedules_tenant_id", "report_schedules", ["tenant_id"])
    op.create_index("ix_report_schedules_template_id", "report_schedules", ["template_id"])

    op.create_table(
        "report_runs",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit_cols(),
        sa.Column("template_id", _UUID,
                  sa.ForeignKey("report_templates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="done"),
        sa.Column("file_key", sa.String(512), nullable=True),
        sa.Column("params", postgresql.JSONB(), nullable=False, server_default="{}"),
    )
    op.create_index("ix_report_runs_tenant_id", "report_runs", ["tenant_id"])
    op.create_index("ix_report_runs_template_id", "report_runs", ["template_id"])


def downgrade() -> None:
    op.drop_table("report_runs")
    op.drop_table("report_schedules")
    op.drop_table("report_templates")
    op.drop_table("export_jobs")
    op.drop_table("import_jobs")
