"""settings, preferences, saved views, notification templates/prefs (docs/05 S1-S3)

Revision ID: 0014_settings_prefs_notifications
Revises: 0013_intelligence
Create Date: 2026-07-14
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0014_supplement_s1_s3"
down_revision: str | None = "0013_intelligence"
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
    # ── S1 settings ───────────────────────────────────────────────────────────
    op.create_table(
        "settings_definitions",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        *_audit_cols(),
        sa.Column("key", sa.String(128), nullable=False),
        sa.Column("value_type", sa.String(16), nullable=False),
        sa.Column("enum_options", postgresql.JSONB(), nullable=True),
        sa.Column("default_value", postgresql.JSONB(), nullable=True),
        sa.Column("scope", sa.String(16), nullable=False, server_default="system"),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.create_index("ix_settings_definitions_key", "settings_definitions", ["key"], unique=True)
    op.create_index("ix_settings_definitions_category", "settings_definitions", ["category"])

    op.create_table(
        "settings_values",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit_cols(),
        sa.Column("definition_id", _UUID,
                  sa.ForeignKey("settings_definitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scope", sa.String(16), nullable=False),
        sa.Column("scope_id", _UUID, nullable=True),
        sa.Column("value", postgresql.JSONB(), nullable=True),
        sa.UniqueConstraint("definition_id", "scope", "scope_id", name="uq_settings_value_scope"),
    )
    op.create_index("ix_settings_values_tenant_id", "settings_values", ["tenant_id"])
    op.create_index("ix_settings_values_definition_id", "settings_values", ["definition_id"])

    # ── S2 preferences + saved views ──────────────────────────────────────────
    op.create_table(
        "user_preferences",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit_cols(),
        sa.Column("user_id", _UUID, nullable=False),
        sa.Column("key", sa.String(128), nullable=False),
        sa.Column("value", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.UniqueConstraint("user_id", "key", name="uq_user_preferences_user_key"),
    )
    op.create_index("ix_user_preferences_tenant_id", "user_preferences", ["tenant_id"])
    op.create_index("ix_user_preferences_user_id", "user_preferences", ["user_id"])

    op.create_table(
        "saved_views",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit_cols(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_id", _UUID, nullable=False),
        sa.Column("entity", sa.String(48), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("filters", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("columns", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("sort", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("is_shared", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index("ix_saved_views_tenant_id", "saved_views", ["tenant_id"])
    op.create_index("ix_saved_views_user_id", "saved_views", ["user_id"])
    op.create_index("ix_saved_views_entity", "saved_views", ["entity"])
    op.create_index("ix_saved_views_deleted_at", "saved_views", ["deleted_at"])

    # ── S3 notification event prefs / templates / outbound log ────────────────
    op.create_table(
        "notification_event_preferences",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit_cols(),
        sa.Column("user_id", _UUID, nullable=False),
        sa.Column("event_code", sa.String(64), nullable=False),
        sa.Column("in_app", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("email", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("digest", sa.String(16), nullable=False, server_default="instant"),
        sa.UniqueConstraint("user_id", "event_code", name="uq_notif_event_pref_user_event"),
    )
    op.create_index("ix_notification_event_preferences_tenant_id",
                    "notification_event_preferences", ["tenant_id"])
    op.create_index("ix_notification_event_preferences_user_id",
                    "notification_event_preferences", ["user_id"])

    op.create_table(
        "notification_templates",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        *_audit_cols(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("tenant_id", _UUID, nullable=True),
        sa.Column("event_code", sa.String(64), nullable=False),
        sa.Column("channel", sa.String(16), nullable=False),
        sa.Column("locale", sa.String(16), nullable=False, server_default="en"),
        sa.Column("subject_tpl", sa.Text(), nullable=True),
        sa.Column("body_tpl", sa.Text(), nullable=False),
        sa.Column("sample_payload", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.UniqueConstraint("tenant_id", "event_code", "channel", "locale",
                            name="uq_notif_template_scope"),
    )
    op.create_index("ix_notification_templates_tenant_id", "notification_templates", ["tenant_id"])
    op.create_index("ix_notification_templates_event_code", "notification_templates", ["event_code"])

    op.create_table(
        "outbound_email_log",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit_cols(),
        sa.Column("to_email", sa.String(320), nullable=False),
        sa.Column("template_id", _UUID,
                  sa.ForeignKey("notification_templates.id", ondelete="SET NULL"), nullable=True),
        sa.Column("subject", sa.String(512), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("provider_msg_id", sa.String(255), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
    )
    op.create_index("ix_outbound_email_log_tenant_id", "outbound_email_log", ["tenant_id"])
    op.create_index("ix_outbound_email_tenant_created", "outbound_email_log",
                    ["tenant_id", "created_at"])

    # notifications gains the source event code (for S3 digest grouping).
    op.add_column("notifications", sa.Column("event_code", sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column("notifications", "event_code")
    op.drop_table("outbound_email_log")
    op.drop_table("notification_templates")
    op.drop_table("notification_event_preferences")
    op.drop_table("saved_views")
    op.drop_table("user_preferences")
    op.drop_table("settings_values")
    op.drop_table("settings_definitions")
