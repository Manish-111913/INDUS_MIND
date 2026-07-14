"""predictions + rca_analyses (docs/02 §7, §10 agents, §15)

Revision ID: 0011_predictions_rca
Revises: 0010_maintenance
Create Date: 2026-07-14
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0011_predictions_rca"
down_revision: str | None = "0010_maintenance"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UUID = postgresql.UUID(as_uuid=True)


def _base() -> list[sa.Column]:
    return [
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
        sa.Column("created_by", _UUID, nullable=True),
        sa.Column("updated_by", _UUID, nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.BigInteger(), nullable=False, server_default="1"),
    ]


def upgrade() -> None:
    op.create_table(
        "predictions",
        *_base(),
        sa.Column("equipment_id", _UUID, sa.ForeignKey("equipment.id", ondelete="CASCADE"),
                  nullable=True),
        sa.Column("risk_score", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("risk_band", sa.String(8), nullable=False, server_default="low"),
        sa.Column("predicted_failure_mode", sa.String(128), nullable=True),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("window_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("drivers", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("recommendation", sa.Text(), nullable=True),
        sa.Column("citations", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("status", sa.String(16), nullable=False, server_default="open"),
        sa.Column("acted_wo_id", _UUID, nullable=True),
        sa.Column("dismiss_reason", sa.Text(), nullable=True),
        sa.Column("model_version", sa.String(32), nullable=False, server_default="heuristic-v1"),
    )
    op.create_index("ix_predictions_tenant_id", "predictions", ["tenant_id"])
    op.create_index("ix_predictions_equipment_id", "predictions", ["equipment_id"])
    op.create_index("ix_predictions_tenant_status", "predictions", ["tenant_id", "status"])
    op.create_index("ix_predictions_deleted_at", "predictions", ["deleted_at"])

    op.create_table(
        "rca_analyses",
        *_base(),
        sa.Column("failure_id", _UUID, sa.ForeignKey("failure_records.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("method", sa.String(16), nullable=False, server_default="agent"),
        sa.Column("status", sa.String(16), nullable=False, server_default="draft"),
        sa.Column("ai_output", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("five_why", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("fishbone", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("human_edits", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("root_cause_final", sa.Text(), nullable=True),
        sa.Column("corrective_actions", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("confidence", sa.Numeric(4, 3), nullable=True),
        sa.Column("prompt_version", sa.Integer(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_by", _UUID, nullable=True),
    )
    op.create_index("ix_rca_analyses_tenant_id", "rca_analyses", ["tenant_id"])
    op.create_index("ix_rca_analyses_failure_id", "rca_analyses", ["failure_id"])
    op.create_index("ix_rca_analyses_deleted_at", "rca_analyses", ["deleted_at"])


def downgrade() -> None:
    op.drop_table("rca_analyses")
    op.drop_table("predictions")
