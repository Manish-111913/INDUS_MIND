"""B19 final: auth recovery, i18n, parts, shift logs, retention, content (docs/08)

Revision ID: 0018_b19_final
Revises: 0017_b18_integration
Create Date: 2026-07-16

One migration for every B19 table (per the prompt). Audit before/after diff columns
(N3/N8) already exist since 0002, so nothing is added there.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0018_b19_final"
down_revision: str | None = "0017_b18_integration"
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
    # ── N1 password reset tokens ─────────────────────────────────────────────
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", _UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
    )
    op.create_index("ix_password_reset_tokens_token_hash", "password_reset_tokens",
                    ["token_hash"], unique=True)
    op.create_index("ix_password_reset_tokens_user", "password_reset_tokens", ["user_id"])

    # ── S9 i18n ──────────────────────────────────────────────────────────────
    op.create_table(
        "locales",
        sa.Column("code", sa.String(8), primary_key=True),  # natural PK: "en", "hi"
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("native_name", sa.String(64), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
    )
    op.create_table(
        "translations",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("locale", sa.String(8), sa.ForeignKey("locales.code", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("namespace", sa.String(48), nullable=False),
        sa.Column("key", sa.String(128), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
        sa.UniqueConstraint("locale", "namespace", "key", name="uq_translations_locale_ns_key"),
    )
    op.create_index("ix_translations_locale_ns", "translations", ["locale", "namespace"])
    op.create_table(
        "translation_gaps",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("locale", sa.String(8), nullable=False),
        sa.Column("namespace", sa.String(48), nullable=False),
        sa.Column("key", sa.String(128), nullable=False),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
        sa.Column("hits", sa.Integer(), nullable=False, server_default="1"),
        sa.UniqueConstraint("locale", "namespace", "key", name="uq_translation_gaps_locale_ns_key"),
    )

    # Lookups gain translated labels (S9). JSONB {"hi": "…"} resolved by caller locale.
    op.add_column("lookups", sa.Column("label_i18n", postgresql.JSONB(), nullable=True))

    # ── S12 spare parts ──────────────────────────────────────────────────────
    op.create_table(
        "parts",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit_cols(),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("name", sa.String(256), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("unit", sa.String(32), nullable=True),  # lookups(type='units') code
        sa.Column("min_stock", sa.Numeric(14, 3), nullable=False, server_default="0"),
        sa.Column("on_hand", sa.Numeric(14, 3), nullable=False, server_default="0"),
        sa.Column("location", sa.String(128), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.UniqueConstraint("tenant_id", "code", name="uq_parts_tenant_code"),
    )
    op.create_index("ix_parts_tenant_id", "parts", ["tenant_id"])
    # Partial index backing the low_stock filter — only rows at/under min matter.
    op.execute("CREATE INDEX ix_parts_low_stock ON parts (tenant_id) WHERE on_hand <= min_stock")

    op.create_table(
        "work_order_parts",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit_cols(),
        sa.Column("work_order_id", _UUID,
                  sa.ForeignKey("work_orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("part_id", _UUID, sa.ForeignKey("parts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("qty_planned", sa.Numeric(14, 3), nullable=False, server_default="0"),
        sa.Column("qty_used", sa.Numeric(14, 3), nullable=True),
        sa.UniqueConstraint("work_order_id", "part_id", name="uq_work_order_parts_wo_part"),
    )
    op.create_index("ix_work_order_parts_tenant_id", "work_order_parts", ["tenant_id"])
    op.create_index("ix_work_order_parts_wo", "work_order_parts", ["work_order_id"])

    op.create_table(
        "part_movements",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit_cols(),
        sa.Column("part_id", _UUID, sa.ForeignKey("parts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("delta", sa.Numeric(14, 3), nullable=False),
        sa.Column("reason", sa.String(16), nullable=False),  # wo_consume|adjustment|receipt
        sa.Column("ref_id", _UUID, nullable=True),  # e.g. the work order that consumed stock
        sa.CheckConstraint("reason IN ('wo_consume','adjustment','receipt')",
                           name="ck_part_movements_reason"),
    )
    op.create_index("ix_part_movements_tenant_id", "part_movements", ["tenant_id"])
    op.create_index("ix_part_movements_part", "part_movements", ["part_id", "created_at"])

    # ── S13 shift logbook ────────────────────────────────────────────────────
    op.create_table(
        "shift_logs",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit_cols(),
        sa.Column("plant_id", _UUID, sa.ForeignKey("plants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("shift", sa.String(32), nullable=False),  # lookups(type='shifts') code
        sa.Column("log_date", sa.Date(), nullable=False),
        sa.Column("author_id", _UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("tags", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("status", sa.String(16), nullable=False, server_default="draft"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ai_summary", sa.Text(), nullable=True),
        # The ingested representation this log was pushed through the pipeline as.
        sa.Column("document_id", _UUID,
                  sa.ForeignKey("documents.id", ondelete="SET NULL"), nullable=True),
        sa.CheckConstraint("status IN ('draft','submitted')", name="ck_shift_logs_status"),
        sa.UniqueConstraint("tenant_id", "plant_id", "shift", "log_date", "author_id",
                            name="uq_shift_logs_natural"),
    )
    op.create_index("ix_shift_logs_tenant_id", "shift_logs", ["tenant_id"])
    op.create_index("ix_shift_logs_filter", "shift_logs", ["tenant_id", "plant_id", "log_date"])

    # ── S14 retention ────────────────────────────────────────────────────────
    op.create_table(
        "retention_policies",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit_cols(),
        sa.Column("entity", sa.String(32), nullable=False),
        sa.Column("keep_days", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(16), nullable=False),  # archive|delete
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_affected", sa.Integer(), nullable=True),
        sa.CheckConstraint("action IN ('archive','delete')", name="ck_retention_action"),
        sa.UniqueConstraint("tenant_id", "entity", name="uq_retention_tenant_entity"),
    )
    op.create_index("ix_retention_policies_tenant_id", "retention_policies", ["tenant_id"])

    # ── N5 content pages ─────────────────────────────────────────────────────
    op.create_table(
        "content_pages",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        # NULL tenant_id = system page (privacy/terms). Tenant may override by slug.
        sa.Column("tenant_id", _UUID, nullable=True),
        *_audit_cols(),
        sa.Column("slug", sa.String(64), nullable=False),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("body_md", sa.Text(), nullable=False),
        # Public pages (privacy/terms) are fetchable pre-login for the landing page.
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.UniqueConstraint("tenant_id", "slug", name="uq_content_pages_tenant_slug"),
    )
    op.create_index("ix_content_pages_slug", "content_pages", ["slug"])


def downgrade() -> None:
    op.drop_table("content_pages")
    op.drop_table("retention_policies")
    op.drop_table("shift_logs")
    op.drop_table("part_movements")
    op.drop_table("work_order_parts")
    op.drop_table("parts")
    op.drop_column("lookups", "label_i18n")
    op.drop_table("translation_gaps")
    op.drop_table("translations")
    op.drop_table("locales")
    op.drop_table("password_reset_tokens")
