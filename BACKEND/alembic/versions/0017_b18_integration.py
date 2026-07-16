"""extraction rules + api keys + webhooks + tours/changelog (docs/05 S7, S8, S10)

Revision ID: 0017_b18_integration
Revises: 0016_dataops
Create Date: 2026-07-16
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0017_b18_integration"
down_revision: str | None = "0016_dataops"
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
    # ── S7 extraction rules ──────────────────────────────────────────────────
    op.create_table(
        "extraction_rules",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit_cols(),
        sa.Column("version", sa.BigInteger(), nullable=False, server_default="1"),
        sa.Column("entity_type", sa.String(32), nullable=False),
        sa.Column("method", sa.String(16), nullable=False),
        sa.Column("pattern", sa.Text(), nullable=True),
        sa.Column("llm_hint", sa.Text(), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("confidence", sa.Numeric(4, 3), nullable=False, server_default="0.7"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("description", sa.Text(), nullable=True),
        sa.CheckConstraint("method IN ('regex','keyword','llm')", name="ck_extraction_rules_method"),
    )
    op.create_index("ix_extraction_rules_tenant_id", "extraction_rules", ["tenant_id"])
    op.create_index("ix_extraction_rules_tenant_active", "extraction_rules",
                    ["tenant_id", "is_active", "priority"])

    # Provenance on entities: which rule, at which version, produced the row.
    op.add_column("extracted_entities", sa.Column("rule_id", _UUID, nullable=True))
    op.add_column("extracted_entities", sa.Column("rule_version", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_extracted_entities_rule_id", "extracted_entities",
                          "extraction_rules", ["rule_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_extracted_entities_rule_id", "extracted_entities", ["rule_id"])

    # ── S8 api keys ──────────────────────────────────────────────────────────
    op.create_table(
        "api_keys",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit_cols(),
        sa.Column("name", sa.String(128), nullable=False),
        # key_prefix is the human-visible fragment ("imk_live_a1b2c3d4"); key_hash
        # is SHA-256 of the whole secret. The plaintext is never stored.
        sa.Column("key_prefix", sa.String(32), nullable=False),
        sa.Column("key_hash", sa.String(64), nullable=False),
        sa.Column("scopes", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.create_index("ix_api_keys_tenant_id", "api_keys", ["tenant_id"])
    # Authentication looks a key up by hash alone (the caller sends only the
    # secret), so this must be unique and indexed across tenants.
    op.create_index("uq_api_keys_key_hash", "api_keys", ["key_hash"], unique=True)
    op.create_index("ix_api_keys_key_prefix", "api_keys", ["key_prefix"])

    # ── S8 webhooks ──────────────────────────────────────────────────────────
    op.create_table(
        "webhook_endpoints",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit_cols(),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("url", sa.String(1024), nullable=False),
        sa.Column("secret", sa.String(128), nullable=False),
        sa.Column("event_codes", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.create_index("ix_webhook_endpoints_tenant_id", "webhook_endpoints", ["tenant_id"])

    op.create_table(
        "webhook_deliveries",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit_cols(),
        sa.Column("endpoint_id", _UUID,
                  sa.ForeignKey("webhook_endpoints.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_code", sa.String(64), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("response_code", sa.Integer(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("next_retry_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('pending','delivering','delivered','retrying','failed')",
                           name="ck_webhook_deliveries_status"),
    )
    op.create_index("ix_webhook_deliveries_tenant_id", "webhook_deliveries", ["tenant_id"])
    op.create_index("ix_webhook_deliveries_endpoint", "webhook_deliveries",
                    ["endpoint_id", "created_at"])
    # Drives the retry sweeper: "due, not terminal".
    op.create_index("ix_webhook_deliveries_due", "webhook_deliveries", ["status", "next_retry_at"])

    # ── S10 tours / changelog ────────────────────────────────────────────────
    op.create_table(
        "tours",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        # NULL tenant_id = system-provided, visible to every tenant.
        sa.Column("tenant_id", _UUID, nullable=True),
        *_audit_cols(),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("role_scope", sa.String(64), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.UniqueConstraint("tenant_id", "code", name="uq_tours_tenant_code"),
    )
    op.create_index("ix_tours_tenant_id", "tours", ["tenant_id"])

    op.create_table(
        "tour_steps",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        *_audit_cols(),
        sa.Column("tour_id", _UUID, sa.ForeignKey("tours.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_no", sa.Integer(), nullable=False),
        sa.Column("selector", sa.String(256), nullable=True),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("placement", sa.String(16), nullable=True),
        sa.UniqueConstraint("tour_id", "order_no", name="uq_tour_steps_tour_order"),
    )

    op.create_table(
        "changelog_entries",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=True),
        *_audit_cols(),
        sa.Column("version", sa.String(32), nullable=False),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("body_md", sa.Text(), nullable=False),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.create_index("ix_changelog_entries_released", "changelog_entries", ["released_at"])


def downgrade() -> None:
    op.drop_table("changelog_entries")
    op.drop_table("tour_steps")
    op.drop_table("tours")
    op.drop_table("webhook_deliveries")
    op.drop_table("webhook_endpoints")
    op.drop_table("api_keys")
    op.drop_index("ix_extracted_entities_rule_id", table_name="extracted_entities")
    op.drop_constraint("fk_extracted_entities_rule_id", "extracted_entities", type_="foreignkey")
    op.drop_column("extracted_entities", "rule_version")
    op.drop_column("extracted_entities", "rule_id")
    op.drop_table("extraction_rules")
