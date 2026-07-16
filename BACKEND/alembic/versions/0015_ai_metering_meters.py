"""ai usage/feedback + model prices + meter readings (docs/05 S4-S5)

Revision ID: 0015_ai_meters
Revises: 0014_supplement_s1_s3
Create Date: 2026-07-14
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0015_ai_meters"
down_revision: str | None = "0014_supplement_s1_s3"
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
    # ── S4 model prices ───────────────────────────────────────────────────────
    op.add_column("ai_model_configs", sa.Column(
        "price_input_usd", sa.Numeric(10, 4), nullable=False, server_default="0"))
    op.add_column("ai_model_configs", sa.Column(
        "price_output_usd", sa.Numeric(10, 4), nullable=False, server_default="0"))

    # ── S4 ai_usage ───────────────────────────────────────────────────────────
    op.create_table(
        "ai_usage",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        *_audit_cols(),
        sa.Column("tenant_id", _UUID, nullable=True),
        sa.Column("user_id", _UUID, nullable=True),
        sa.Column("feature", sa.String(32), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("model_config_id", _UUID, nullable=True),
        sa.Column("model_name", sa.String(128), nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completion_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cost_usd", sa.Numeric(12, 6), nullable=False, server_default="0"),
        sa.Column("latency_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cache_hit", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index("ix_ai_usage_tenant_id", "ai_usage", ["tenant_id"])
    op.create_index("ix_ai_usage_feature", "ai_usage", ["feature"])
    op.create_index("ix_ai_usage_tenant_feature_created", "ai_usage",
                    ["tenant_id", "feature", "created_at"])

    # ── S4 ai_feedback ────────────────────────────────────────────────────────
    op.create_table(
        "ai_feedback",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit_cols(),
        sa.Column("message_id", _UUID,
                  sa.ForeignKey("chat_messages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", _UUID, nullable=False),
        sa.Column("rating", sa.String(8), nullable=False),
        sa.Column("reason_code", sa.String(64), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
    )
    op.create_index("ix_ai_feedback_tenant_id", "ai_feedback", ["tenant_id"])
    op.create_index("ix_ai_feedback_message_id", "ai_feedback", ["message_id"])
    op.create_index("ix_ai_feedback_user_id", "ai_feedback", ["user_id"])

    # ── S5 meters ─────────────────────────────────────────────────────────────
    op.create_table(
        "meter_definitions",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit_cols(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("unit_id", _UUID, nullable=True),
        sa.Column("unit", sa.String(32), nullable=True),
        sa.Column("reading_type", sa.String(16), nullable=False, server_default="gauge"),
        sa.Column("normal_min", sa.Numeric(14, 4), nullable=True),
        sa.Column("normal_max", sa.Numeric(14, 4), nullable=True),
        sa.UniqueConstraint("tenant_id", "code", name="uq_meter_definitions_tenant_code"),
    )
    op.create_index("ix_meter_definitions_tenant_id", "meter_definitions", ["tenant_id"])

    op.create_table(
        "equipment_meters",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit_cols(),
        sa.Column("equipment_id", _UUID,
                  sa.ForeignKey("equipment.id", ondelete="CASCADE"), nullable=False),
        sa.Column("meter_definition_id", _UUID,
                  sa.ForeignKey("meter_definitions.id", ondelete="CASCADE"), nullable=False),
        sa.UniqueConstraint("equipment_id", "meter_definition_id", name="uq_equipment_meter"),
    )
    op.create_index("ix_equipment_meters_tenant_id", "equipment_meters", ["tenant_id"])
    op.create_index("ix_equipment_meters_equipment_id", "equipment_meters", ["equipment_id"])
    op.create_index("ix_equipment_meters_meter_definition_id", "equipment_meters",
                    ["meter_definition_id"])

    op.create_table(
        "meter_readings",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit_cols(),
        sa.Column("equipment_meter_id", _UUID,
                  sa.ForeignKey("equipment_meters.id", ondelete="CASCADE"), nullable=False),
        sa.Column("value", sa.Numeric(14, 4), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(16), nullable=False, server_default="manual"),
        sa.Column("recorded_by", _UUID, nullable=True),
    )
    op.create_index("ix_meter_readings_tenant_id", "meter_readings", ["tenant_id"])
    # (equipment_meter_id, recorded_at DESC) for fast last-N / range reads.
    op.execute("CREATE INDEX ix_meter_readings_meter_recorded ON meter_readings "
               "(equipment_meter_id, recorded_at DESC)")


def downgrade() -> None:
    op.drop_table("meter_readings")
    op.drop_table("equipment_meters")
    op.drop_table("meter_definitions")
    op.drop_table("ai_feedback")
    op.drop_table("ai_usage")
    op.drop_column("ai_model_configs", "price_output_usd")
    op.drop_column("ai_model_configs", "price_input_usd")
