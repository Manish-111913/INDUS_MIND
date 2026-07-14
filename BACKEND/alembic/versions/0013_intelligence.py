"""notifications, quality, lessons, dashboards, analytics (docs/02 §7, §20-22)

Adds the B12 tables: notifications / notification_preferences / notification_rules,
ncrs, lessons, widget_registry / dashboard_configs, report_definitions /
scheduled_reports.

Revision ID: 0013_intelligence
Revises: 0012_compliance
Create Date: 2026-07-14
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0013_intelligence"
down_revision: str | None = "0012_compliance"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UUID = postgresql.UUID(as_uuid=True)


def _audit_min() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
        sa.Column("created_by", _UUID, nullable=True),
        sa.Column("updated_by", _UUID, nullable=True),
    ]


def _soft_version() -> list[sa.Column]:
    return [
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.BigInteger(), nullable=False, server_default=sa.text("1")),
    ]


def _pk() -> sa.Column:
    return sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()"))


def upgrade() -> None:
    # ── notifications ─────────────────────────────────────────────────────────
    op.create_table(
        "notifications", _pk(),
        sa.Column("tenant_id", _UUID, nullable=False), *_audit_min(),
        sa.Column("user_id", _UUID, nullable=False),
        sa.Column("category", sa.String(48), nullable=False),
        sa.Column("priority", sa.String(16), nullable=False, server_default="normal"),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("entity_type", sa.String(64), nullable=True),
        sa.Column("entity_id", _UUID, nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("channels_sent", postgresql.JSONB(), nullable=False, server_default="[]"),
    )
    op.create_index("ix_notifications_tenant_id", "notifications", ["tenant_id"])
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])
    op.create_index("ix_notifications_user_read", "notifications", ["user_id", "read_at"])
    op.create_index("ix_notifications_tenant_category", "notifications", ["tenant_id", "category"])

    op.create_table(
        "notification_preferences", _pk(),
        sa.Column("tenant_id", _UUID, nullable=False), *_audit_min(),
        sa.Column("user_id", _UUID, nullable=False),
        sa.Column("category", sa.String(48), nullable=False),
        sa.Column("channel", sa.String(16), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.UniqueConstraint("user_id", "category", "channel",
                            name="uq_notif_pref_user_cat_channel"),
    )
    op.create_index("ix_notification_preferences_tenant_id", "notification_preferences", ["tenant_id"])
    op.create_index("ix_notification_preferences_user_id", "notification_preferences", ["user_id"])

    op.create_table(
        "notification_rules", _pk(), *_audit_min(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("tenant_id", _UUID, nullable=True),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("category", sa.String(48), nullable=False),
        sa.Column("priority", sa.String(16), nullable=False, server_default="normal"),
        sa.Column("audience", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("channels", postgresql.JSONB(), nullable=False, server_default='["in_app"]'),
        sa.Column("title_template", sa.Text(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.create_index("ix_notification_rules_tenant_id", "notification_rules", ["tenant_id"])
    op.create_index("ix_notification_rules_event_type", "notification_rules", ["event_type"])

    # ── quality: ncrs ─────────────────────────────────────────────────────────
    op.create_table(
        "ncrs", _pk(),
        sa.Column("tenant_id", _UUID, nullable=False), *_audit_min(), *_soft_version(),
        sa.Column("ncr_number", sa.String(32), nullable=False),
        sa.Column("area_id", _UUID, nullable=True),
        sa.Column("line", sa.String(64), nullable=True),
        sa.Column("defect_type_id", _UUID, nullable=True),
        sa.Column("severity", sa.String(16), nullable=False, server_default="minor"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("equipment_id", _UUID, nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="open"),
        sa.Column("capa", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "ncr_number", name="uq_ncrs_tenant_number"),
    )
    op.create_index("ix_ncrs_tenant_id", "ncrs", ["tenant_id"])
    op.create_index("ix_ncrs_area_id", "ncrs", ["area_id"])
    op.create_index("ix_ncrs_equipment_id", "ncrs", ["equipment_id"])
    op.create_index("ix_ncrs_deleted_at", "ncrs", ["deleted_at"])
    op.create_index("ix_ncrs_tenant_status", "ncrs", ["tenant_id", "status"])
    op.create_index("ix_ncrs_defect_type", "ncrs", ["tenant_id", "defect_type_id"])

    # ── lessons ───────────────────────────────────────────────────────────────
    op.create_table(
        "lessons", _pk(),
        sa.Column("tenant_id", _UUID, nullable=False), *_audit_min(), *_soft_version(),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("narrative", sa.Text(), nullable=True),
        sa.Column("pattern_summary", sa.Text(), nullable=True),
        sa.Column("pattern_key", sa.String(128), nullable=True),
        sa.Column("evidence", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("affected_equipment_ids", postgresql.ARRAY(_UUID), nullable=False,
                  server_default="{}"),
        sa.Column("recommended_action", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Numeric(4, 3), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="candidate"),
        sa.Column("source", sa.String(16), nullable=False, server_default="agent"),
        sa.Column("prompt_version", sa.Integer(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_by", _UUID, nullable=True),
    )
    op.create_index("ix_lessons_tenant_id", "lessons", ["tenant_id"])
    op.create_index("ix_lessons_deleted_at", "lessons", ["deleted_at"])
    op.create_index("ix_lessons_pattern_key", "lessons", ["pattern_key"])

    # ── dashboards ────────────────────────────────────────────────────────────
    op.create_table(
        "widget_registry", _pk(), *_audit_min(),
        sa.Column("key", sa.String(64), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("type", sa.String(32), nullable=False),
        sa.Column("data_endpoint", sa.String(255), nullable=False),
        sa.Column("default_params", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("required_permission", sa.String(64), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("config", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.UniqueConstraint("key", name="uq_widget_registry_key"),
    )
    op.create_index("ix_widget_registry_key", "widget_registry", ["key"])

    op.create_table(
        "dashboard_configs", _pk(),
        sa.Column("tenant_id", _UUID, nullable=False), *_audit_min(), *_soft_version(),
        sa.Column("role_id", _UUID, nullable=True),
        sa.Column("user_id", _UUID, nullable=True),
        sa.Column("layout", postgresql.JSONB(), nullable=False, server_default="[]"),
    )
    op.create_index("ix_dashboard_configs_tenant_id", "dashboard_configs", ["tenant_id"])
    op.create_index("ix_dashboard_configs_role_id", "dashboard_configs", ["role_id"])
    op.create_index("ix_dashboard_configs_user_id", "dashboard_configs", ["user_id"])
    op.create_index("ix_dashboard_configs_deleted_at", "dashboard_configs", ["deleted_at"])
    op.create_index("ix_dashboard_configs_tenant_role", "dashboard_configs", ["tenant_id", "role_id"])
    op.create_index("ix_dashboard_configs_tenant_user", "dashboard_configs", ["tenant_id", "user_id"])

    # ── analytics ─────────────────────────────────────────────────────────────
    op.create_table(
        "report_definitions", _pk(), *_audit_min(), *_soft_version(),
        sa.Column("tenant_id", _UUID, nullable=True),
        sa.Column("key", sa.String(64), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(48), nullable=True),
        sa.Column("sql_template", sa.Text(), nullable=False),
        sa.Column("params_schema", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("chart_config", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("required_permission", sa.String(64), nullable=True),
    )
    op.create_index("ix_report_definitions_tenant_id", "report_definitions", ["tenant_id"])
    op.create_index("ix_report_definitions_key", "report_definitions", ["key"])
    op.create_index("ix_report_definitions_deleted_at", "report_definitions", ["deleted_at"])

    op.create_table(
        "scheduled_reports", _pk(),
        sa.Column("tenant_id", _UUID, nullable=False), *_audit_min(), *_soft_version(),
        sa.Column("report_id", _UUID, sa.ForeignKey("report_definitions.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("cron", sa.String(64), nullable=False),
        sa.Column("recipients", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("params", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("format", sa.String(8), nullable=False, server_default="xlsx"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_scheduled_reports_tenant_id", "scheduled_reports", ["tenant_id"])
    op.create_index("ix_scheduled_reports_report_id", "scheduled_reports", ["report_id"])
    op.create_index("ix_scheduled_reports_deleted_at", "scheduled_reports", ["deleted_at"])


def downgrade() -> None:
    op.drop_table("scheduled_reports")
    op.drop_table("report_definitions")
    op.drop_table("dashboard_configs")
    op.drop_table("widget_registry")
    op.drop_table("lessons")
    op.drop_table("ncrs")
    op.drop_table("notification_rules")
    op.drop_table("notification_preferences")
    op.drop_table("notifications")
