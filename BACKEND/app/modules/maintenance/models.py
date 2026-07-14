"""Maintenance models: work_orders, maintenance_schedules, failure_records (docs/02 §7, §18).

`work_orders` carries the maintenance lifecycle state machine (§7 status ENUM);
legal transitions are enforced in `state_machine.py`, not by the DB. Lookup-backed
fields (`type`, `priority`, `failure_code_id`, `failure_mode_id`) are soft
references to `lookups` rows — validated by the service on write, never a
cross-module FK (docs/02 §2). `maintenance_proposals` persists the before/after
diff of an LLM schedule-optimization run so it can be reviewed then applied.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.common.base import (
    AuditFieldsMixin,
    Base,
    SoftDeleteMixin,
    TenantMixin,
    VersionMixin,
)


class WorkOrder(Base, TenantMixin, AuditFieldsMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "work_orders"

    wo_number: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    equipment_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("equipment.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    type: Mapped[str] = mapped_column(String(32), nullable=False)          # → lookups(wo_types)
    priority: Mapped[str] = mapped_column(String(16), nullable=False)      # → lookups(priorities)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="open")
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    requested_by: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sla_breach: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    failure_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("failure_records.id", ondelete="SET NULL"), nullable=True
    )
    checklist: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    parts: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    labor_hours: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)
    closure_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    failure_code_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    source: Mapped[str] = mapped_column(String(16), nullable=False, server_default="manual")
    schedule_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("maintenance_schedules.id", ondelete="SET NULL"),
        nullable=True,
    )

    __table_args__ = (
        UniqueConstraint("tenant_id", "wo_number", name="uq_work_orders_tenant_number"),
        Index("ix_work_orders_tenant_status_priority", "tenant_id", "status", "priority"),
        Index("ix_work_orders_assignee_due", "assignee_id", "due_at"),
    )


class MaintenanceSchedule(Base, TenantMixin, AuditFieldsMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "maintenance_schedules"

    equipment_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("equipment.id", ondelete="CASCADE"),
        nullable=True, index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    frequency_type: Mapped[str] = mapped_column(String(16), nullable=False, server_default="time")
    interval_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    next_due_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    last_generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_template: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")


class FailureRecord(Base, TenantMixin, AuditFieldsMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "failure_records"

    equipment_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("equipment.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    work_order_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    failure_mode_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    failure_code_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    severity: Mapped[str | None] = mapped_column(String(16), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    detected_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    downtime_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    production_loss: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    rca_status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="none")


class Prediction(Base, TenantMixin, AuditFieldsMixin, SoftDeleteMixin, VersionMixin):
    """Predictive-maintenance risk record (docs/02 §7, §14).

    Risk is an honest heuristic (failure frequency + overdue-vs-schedule +
    criticality weight + repeat-mode momentum); `drivers` is the explainability
    list and `recommendation`/`citations` reference the history that justifies it.
    Accepting a prediction spawns a WO and links `acted_wo_id` (feedback loop);
    dismissing stores `dismiss_reason`.
    """

    __tablename__ = "predictions"

    equipment_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("equipment.id", ondelete="CASCADE"),
        nullable=True, index=True,
    )
    risk_score: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, server_default="0")
    risk_band: Mapped[str] = mapped_column(String(8), nullable=False, server_default="low")
    predicted_failure_mode: Mapped[str | None] = mapped_column(String(128), nullable=True)
    window_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    window_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    drivers: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    recommendation: Mapped[str | None] = mapped_column(Text, nullable=True)
    citations: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="open")
    acted_wo_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    dismiss_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_version: Mapped[str] = mapped_column(String(32), nullable=False, server_default="heuristic-v1")

    __table_args__ = (
        Index("ix_predictions_tenant_status", "tenant_id", "status"),
    )


class RCAAnalysis(Base, TenantMixin, AuditFieldsMixin, SoftDeleteMixin, VersionMixin):
    """Root-cause analysis produced by the RCA agent (docs/02 §7, §13.2 §15).

    `ai_output` holds the ranked, evidence-checked causes; `five_why` and
    `fishbone` feed the frontend RCA canvas; `human_edits`/`root_cause_final`
    capture the human-in-the-loop; publishing emits a lessons-learned candidate.
    """

    __tablename__ = "rca_analyses"

    failure_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("failure_records.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    method: Mapped[str] = mapped_column(String(16), nullable=False, server_default="agent")
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="draft")
    ai_output: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    five_why: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    fishbone: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    human_edits: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    root_cause_final: Mapped[str | None] = mapped_column(Text, nullable=True)
    corrective_actions: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(4, 3), nullable=True)
    prompt_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_by: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)


class MaintenanceProposal(Base, TenantMixin, AuditFieldsMixin, SoftDeleteMixin, VersionMixin):
    """Persisted before/after diff from a schedule-optimization LLM run (docs/02 §18).

    `diff` holds ``{changes:[{schedule_id, before, after, rationale}], summary}``.
    ``applied_at`` gates the apply endpoint (idempotent — a proposal applies once).
    """

    __tablename__ = "maintenance_proposals"

    kind: Mapped[str] = mapped_column(String(32), nullable=False, server_default="schedule_optimize")
    scope: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="proposed")
    diff: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    prompt_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    applied_by: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
