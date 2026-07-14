"""maintenance: work_orders, maintenance_schedules, failure_records, proposals

docs/02 §7, §18. Work-order lifecycle state machine (status ENUM as VARCHAR +
app-level machine), schedules (beat auto-create source), failure records
(created/linked on close), and persisted optimization proposals.

Revision ID: 0010_maintenance
Revises: 0009_chat_ai
Create Date: 2026-07-14
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010_maintenance"
down_revision: str | None = "0009_chat_ai"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UUID = postgresql.UUID(as_uuid=True)


def _audit() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
        sa.Column("created_by", _UUID, nullable=True),
        sa.Column("updated_by", _UUID, nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.BigInteger(), nullable=False, server_default=sa.text("1")),
    ]


def upgrade() -> None:
    # ── maintenance_schedules ────────────────────────────────────────────────
    op.create_table(
        "maintenance_schedules",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit(),
        sa.Column("equipment_id", _UUID, sa.ForeignKey("equipment.id", ondelete="CASCADE"),
                  nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("frequency_type", sa.String(16), nullable=False, server_default="time"),
        sa.Column("interval_days", sa.Integer(), nullable=True),
        sa.Column("next_due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_template", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.create_index("ix_maintenance_schedules_tenant_id", "maintenance_schedules", ["tenant_id"])
    op.create_index("ix_maintenance_schedules_equipment_id", "maintenance_schedules", ["equipment_id"])
    op.create_index("ix_maintenance_schedules_next_due_at", "maintenance_schedules", ["next_due_at"])
    op.create_index("ix_maintenance_schedules_deleted_at", "maintenance_schedules", ["deleted_at"])

    # ── failure_records ──────────────────────────────────────────────────────
    op.create_table(
        "failure_records",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit(),
        sa.Column("equipment_id", _UUID, sa.ForeignKey("equipment.id", ondelete="SET NULL"),
                  nullable=True),
        sa.Column("work_order_id", _UUID, nullable=True),
        sa.Column("failure_mode_id", _UUID, nullable=True),
        sa.Column("failure_code_id", _UUID, nullable=True),
        sa.Column("severity", sa.String(16), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("detected_by", sa.String(64), nullable=True),
        sa.Column("downtime_minutes", sa.Integer(), nullable=True),
        sa.Column("production_loss", sa.Numeric(12, 2), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("rca_status", sa.String(16), nullable=False, server_default="none"),
    )
    op.create_index("ix_failure_records_tenant_id", "failure_records", ["tenant_id"])
    op.create_index("ix_failure_records_equipment_id", "failure_records", ["equipment_id"])
    op.create_index("ix_failure_records_deleted_at", "failure_records", ["deleted_at"])

    # ── work_orders ──────────────────────────────────────────────────────────
    op.create_table(
        "work_orders",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit(),
        sa.Column("wo_number", sa.String(32), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("equipment_id", _UUID, sa.ForeignKey("equipment.id", ondelete="SET NULL"),
                  nullable=True),
        sa.Column("type", sa.String(32), nullable=False),
        sa.Column("priority", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="open"),
        sa.Column("assignee_id", _UUID, sa.ForeignKey("users.id", ondelete="SET NULL"),
                  nullable=True),
        sa.Column("requested_by", _UUID, nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sla_breach", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("failure_id", _UUID,
                  sa.ForeignKey("failure_records.id", ondelete="SET NULL"), nullable=True),
        sa.Column("checklist", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("parts", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("labor_hours", sa.Numeric(8, 2), nullable=True),
        sa.Column("closure_notes", sa.Text(), nullable=True),
        sa.Column("failure_code_id", _UUID, nullable=True),
        sa.Column("source", sa.String(16), nullable=False, server_default="manual"),
        sa.Column("schedule_id", _UUID,
                  sa.ForeignKey("maintenance_schedules.id", ondelete="SET NULL"), nullable=True),
        sa.UniqueConstraint("tenant_id", "wo_number", name="uq_work_orders_tenant_number"),
    )
    op.create_index("ix_work_orders_tenant_id", "work_orders", ["tenant_id"])
    op.create_index("ix_work_orders_equipment_id", "work_orders", ["equipment_id"])
    op.create_index("ix_work_orders_deleted_at", "work_orders", ["deleted_at"])
    op.create_index("ix_work_orders_tenant_status_priority", "work_orders",
                    ["tenant_id", "status", "priority"])
    op.create_index("ix_work_orders_assignee_due", "work_orders", ["assignee_id", "due_at"])

    # ── maintenance_proposals ────────────────────────────────────────────────
    op.create_table(
        "maintenance_proposals",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit(),
        sa.Column("kind", sa.String(32), nullable=False, server_default="schedule_optimize"),
        sa.Column("scope", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("status", sa.String(16), nullable=False, server_default="proposed"),
        sa.Column("diff", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("rationale", sa.Text(), nullable=True),
        sa.Column("prompt_version", sa.Integer(), nullable=True),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("applied_by", _UUID, nullable=True),
    )
    op.create_index("ix_maintenance_proposals_tenant_id", "maintenance_proposals", ["tenant_id"])
    op.create_index("ix_maintenance_proposals_deleted_at", "maintenance_proposals", ["deleted_at"])


def downgrade() -> None:
    op.drop_table("maintenance_proposals")
    op.drop_table("work_orders")
    op.drop_table("failure_records")
    op.drop_table("maintenance_schedules")
