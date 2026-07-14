"""Maintenance schemas (docs/02 §13, §18, §41).

Request/response models for work orders, schedules, failures, proposals plus the
AI-context and metrics read models. `type`/`priority`/`status` carry the backend
lookup codes (preventive|corrective|predictive|inspection, critical|…|low,
open|in_progress|…); the frontend maps its display labels onto these.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.common.schemas import StrictModel


# ── work orders ──────────────────────────────────────────────────────────────
class WorkOrderCreate(StrictModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    equipment_id: uuid.UUID | None = None
    type: str = Field(max_length=32)
    priority: str = Field(max_length=16)
    assignee_id: uuid.UUID | None = None
    due_at: datetime | None = None
    checklist: list = Field(default_factory=list)
    parts: list = Field(default_factory=list)


class WorkOrderUpdate(StrictModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    equipment_id: uuid.UUID | None = None
    type: str | None = Field(default=None, max_length=32)
    priority: str | None = Field(default=None, max_length=16)
    due_at: datetime | None = None
    checklist: list | None = None
    parts: list | None = None
    version: int | None = None


class WorkOrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    wo_number: str
    title: str
    description: str | None = None
    equipment_id: uuid.UUID | None = None
    type: str
    priority: str
    status: str
    assignee_id: uuid.UUID | None = None
    requested_by: uuid.UUID | None = None
    due_at: datetime | None = None
    started_at: datetime | None = None
    closed_at: datetime | None = None
    sla_breach: bool
    failure_id: uuid.UUID | None = None
    failure_code_id: uuid.UUID | None = None
    checklist: list
    parts: list
    labor_hours: Decimal | None = None
    closure_notes: str | None = None
    source: str
    schedule_id: uuid.UUID | None = None
    version: int


class WorkOrderAssign(StrictModel):
    assignee_id: uuid.UUID
    version: int | None = None


class WorkOrderTransition(StrictModel):
    status: str = Field(max_length=16)
    note: str | None = None
    version: int | None = None


class PartLine(StrictModel):
    part_no: str | None = None
    name: str | None = None
    qty: float = 1
    cost: float | None = None


class WorkOrderClose(StrictModel):
    failure_code_id: uuid.UUID | None = None
    failure_mode_id: uuid.UUID | None = None
    closure_notes: str = Field(min_length=1)
    labor_hours: Decimal | None = Field(default=None, ge=0)
    parts: list[PartLine] = Field(default_factory=list)
    downtime_minutes: int | None = Field(default=None, ge=0)
    version: int | None = None


# ── schedules ────────────────────────────────────────────────────────────────
class ScheduleCreate(StrictModel):
    equipment_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=255)
    frequency_type: str = Field(default="time", max_length=16)
    interval_days: int | None = Field(default=None, ge=1)
    next_due_at: datetime | None = None
    task_template: dict = Field(default_factory=dict)
    active: bool = True


class ScheduleUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    frequency_type: str | None = Field(default=None, max_length=16)
    interval_days: int | None = Field(default=None, ge=1)
    next_due_at: datetime | None = None
    task_template: dict | None = None
    active: bool | None = None
    version: int | None = None


class ScheduleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    equipment_id: uuid.UUID | None = None
    name: str
    frequency_type: str
    interval_days: int | None = None
    next_due_at: datetime | None = None
    last_generated_at: datetime | None = None
    task_template: dict
    active: bool
    version: int


class ScheduleOptimize(StrictModel):
    scope: dict = Field(default_factory=dict)


# ── failures ─────────────────────────────────────────────────────────────────
class FailureCreate(StrictModel):
    equipment_id: uuid.UUID | None = None
    work_order_id: uuid.UUID | None = None
    failure_mode_id: uuid.UUID | None = None
    failure_code_id: uuid.UUID | None = None
    severity: str | None = Field(default=None, max_length=16)
    occurred_at: datetime
    detected_by: str | None = Field(default=None, max_length=64)
    downtime_minutes: int | None = Field(default=None, ge=0)
    production_loss: Decimal | None = Field(default=None, ge=0)
    description: str | None = None


class FailureUpdate(StrictModel):
    failure_mode_id: uuid.UUID | None = None
    failure_code_id: uuid.UUID | None = None
    severity: str | None = Field(default=None, max_length=16)
    occurred_at: datetime | None = None
    detected_by: str | None = Field(default=None, max_length=64)
    downtime_minutes: int | None = Field(default=None, ge=0)
    production_loss: Decimal | None = Field(default=None, ge=0)
    description: str | None = None
    rca_status: str | None = Field(default=None, max_length=16)
    version: int | None = None


class FailureRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    equipment_id: uuid.UUID | None = None
    work_order_id: uuid.UUID | None = None
    failure_mode_id: uuid.UUID | None = None
    failure_code_id: uuid.UUID | None = None
    severity: str | None = None
    occurred_at: datetime
    detected_by: str | None = None
    downtime_minutes: int | None = None
    production_loss: Decimal | None = None
    description: str | None = None
    rca_status: str
    version: int


# ── proposals ────────────────────────────────────────────────────────────────
class ProposalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    kind: str
    scope: dict
    status: str
    diff: dict
    rationale: str | None = None
    prompt_version: int | None = None
    applied_at: datetime | None = None
    version: int


# ── read models (not table-backed) ───────────────────────────────────────────
class Citation(BaseModel):
    document_id: str | None = None
    version_id: str | None = None
    page: int | None = None
    chunk_id: str | None = None
    title: str | None = None
    snippet: str | None = None


class SimilarWorkOrder(BaseModel):
    id: str
    wo_number: str
    title: str
    fixed_by: str | None = None
    closed_at: datetime | None = None
    confidence: float
    citation: Citation | None = None


class SopStep(BaseModel):
    title: str
    excerpt: str
    confidence: float
    citation: Citation


class KnownFailureMode(BaseModel):
    mode: str
    frequency: int
    confidence: float
    recommendation: str | None = None


class AiContext(BaseModel):
    equipment_id: str
    equipment_tag: str | None = None
    similar_work_orders: list[SimilarWorkOrder] = Field(default_factory=list)
    sop_steps: list[SopStep] = Field(default_factory=list)
    failure_modes: list[KnownFailureMode] = Field(default_factory=list)


class MaintenanceMetrics(BaseModel):
    scope: dict
    mtbf_hours: float | None = None
    mttr_hours: float | None = None
    pm_compliance: float | None = None
    backlog_hours: float | None = None
    open_work_orders: int = 0
    overdue_work_orders: int = 0
    failures: int = 0


# ── predictions (docs/02 §7, §14) ─────────────────────────────────────────────
class PredictionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    equipment_id: uuid.UUID | None = None
    risk_score: Decimal
    risk_band: str
    predicted_failure_mode: str | None = None
    window_start: datetime | None = None
    window_end: datetime | None = None
    drivers: list
    recommendation: str | None = None
    citations: list
    status: str
    acted_wo_id: uuid.UUID | None = None
    dismiss_reason: str | None = None
    model_version: str
    version: int


class PredictionDismiss(StrictModel):
    reason: str = Field(min_length=1, max_length=1024)
