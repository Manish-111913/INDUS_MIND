"""Compliance schemas (docs/02 §13, §19).

Request/response models for regulations, clauses, mappings, gaps, audits and
evidence packages, plus the scan trigger and the coverage-heatmap read model.
Enum-like fields carry backend codes; the frontend maps display labels onto them.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.common.schemas import StrictModel


# ── regulations ──────────────────────────────────────────────────────────────
class RegulationCreate(StrictModel):
    code: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=512)
    body: str = Field(default="internal", max_length=32)
    source_document_id: uuid.UUID | None = None
    effective_date: date | None = None
    edition: str | None = Field(default=None, max_length=32)


class RegulationUpdate(StrictModel):
    code: str | None = Field(default=None, min_length=1, max_length=64)
    title: str | None = Field(default=None, min_length=1, max_length=512)
    body: str | None = Field(default=None, max_length=32)
    effective_date: date | None = None
    edition: str | None = Field(default=None, max_length=32)
    status: str | None = Field(default=None, max_length=16)
    version: int | None = None


class RegulationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    code: str
    title: str
    body: str
    source_document_id: uuid.UUID | None = None
    effective_date: date | None = None
    edition: str | None = None
    status: str
    version: int


class RegulationImport(StrictModel):
    document_id: uuid.UUID
    code: str | None = Field(default=None, max_length=64)
    title: str | None = Field(default=None, max_length=512)
    body: str | None = Field(default=None, max_length=32)


# ── clauses ──────────────────────────────────────────────────────────────────
class ClauseCreate(StrictModel):
    regulation_id: uuid.UUID
    clause_no: str = Field(min_length=1, max_length=32)
    parent_id: uuid.UUID | None = None
    title: str | None = Field(default=None, max_length=512)
    text: str = ""
    category: str | None = Field(default=None, max_length=64)
    severity_default: str = Field(default="medium", max_length=16)
    order_index: int = 0


class ClauseUpdate(StrictModel):
    clause_no: str | None = Field(default=None, min_length=1, max_length=32)
    parent_id: uuid.UUID | None = None
    title: str | None = Field(default=None, max_length=512)
    text: str | None = None
    category: str | None = Field(default=None, max_length=64)
    severity_default: str | None = Field(default=None, max_length=16)
    order_index: int | None = None
    version: int | None = None


class ClauseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    regulation_id: uuid.UUID
    parent_id: uuid.UUID | None = None
    clause_no: str
    title: str | None = None
    text: str
    category: str | None = None
    severity_default: str
    order_index: int
    path: str | None = None
    version: int


# ── mappings ─────────────────────────────────────────────────────────────────
class MappingCreate(StrictModel):
    clause_id: uuid.UUID
    target_type: str = Field(max_length=16)  # procedure_doc|equipment|record
    target_id: uuid.UUID
    target_label: str | None = Field(default=None, max_length=512)
    mapping_confidence: float = Field(default=1.0, ge=0, le=1)
    rationale: str | None = None


class MappingStatusUpdate(StrictModel):
    status: str = Field(pattern=r"^(proposed|confirmed|rejected)$")
    version: int | None = None


class MappingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    clause_id: uuid.UUID
    target_type: str
    target_id: uuid.UUID
    target_label: str | None = None
    mapping_confidence: Decimal
    mapped_by: str
    status: str
    rationale: str | None = None
    citation: dict
    version: int


# ── gaps ─────────────────────────────────────────────────────────────────────
class GapCreate(StrictModel):
    clause_id: uuid.UUID | None = None
    title: str = Field(min_length=1, max_length=512)
    severity: str = Field(default="medium", max_length=16)
    description: str | None = None
    ai_explanation: str | None = None
    affected_equipment_id: uuid.UUID | None = None
    affected_document_id: uuid.UUID | None = None
    owner_id: uuid.UUID | None = None
    due_at: datetime | None = None


class GapUpdate(StrictModel):
    title: str | None = Field(default=None, min_length=1, max_length=512)
    severity: str | None = Field(default=None, max_length=16)
    description: str | None = None
    owner_id: uuid.UUID | None = None
    due_at: datetime | None = None
    status: str | None = Field(
        default=None, pattern=r"^(open|in_remediation|resolved|accepted_risk)$"
    )
    version: int | None = None


class GapRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    clause_id: uuid.UUID | None = None
    title: str
    severity: str
    description: str | None = None
    ai_explanation: str | None = None
    affected_equipment_id: uuid.UUID | None = None
    affected_document_id: uuid.UUID | None = None
    owner_id: uuid.UUID | None = None
    due_at: datetime | None = None
    status: str
    remediation_wo_id: uuid.UUID | None = None
    detected_by: str
    detail: dict
    resolved_at: datetime | None = None
    version: int


# ── scan (docs/02 §15) ────────────────────────────────────────────────────────
class ComplianceScan(StrictModel):
    scope: dict = Field(default_factory=dict)


# ── audits ───────────────────────────────────────────────────────────────────
class AuditCreate(StrictModel):
    name: str = Field(min_length=1, max_length=255)
    body: str | None = Field(default=None, max_length=32)
    scheduled_at: datetime | None = None
    auditor: str | None = Field(default=None, max_length=255)
    scope: dict = Field(default_factory=dict)
    checklist: list = Field(default_factory=list)


class AuditUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    body: str | None = Field(default=None, max_length=32)
    scheduled_at: datetime | None = None
    auditor: str | None = Field(default=None, max_length=255)
    scope: dict | None = None
    status: str | None = Field(default=None, max_length=16)
    checklist: list | None = None
    version: int | None = None


class AuditRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    body: str | None = None
    scheduled_at: datetime | None = None
    auditor: str | None = None
    scope: dict
    status: str
    checklist: list
    version: int


# ── evidence packages ────────────────────────────────────────────────────────
class EvidencePackageCreate(StrictModel):
    scope: dict = Field(default_factory=dict)
    audit_id: uuid.UUID | None = None
    title: str | None = Field(default=None, max_length=255)


class EvidencePackageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    audit_id: uuid.UUID | None = None
    title: str | None = None
    scope: dict
    status: str
    summary: dict
    error: str | None = None
    share_token: str | None = None
    created_at: datetime
    version: int
