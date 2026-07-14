"""Compliance models: regulations, regulation_clauses, compliance_mappings,
compliance_gaps, audits, evidence_packages (docs/02 §7, §19).

`regulation_clauses` is a self-referential tree (`parent_id`) parsed from an
ingested regulation document. `compliance_mappings` / `compliance_gaps` are the
output of the mapping agent (§10 compliance graph): each clause is either mapped
to a governing procedure/equipment/record (confidence) or raised as a gap with a
side-by-side explanation. `evidence_packages` render a coverage PDF + ZIP of
cited sources to S3 for auditor download (share-token, read-only).

Soft cross-module references (`source_document_id`, `affected_equipment_id`,
`affected_document_id`, `owner_id`, `remediation_wo_id`, `target_id`) are plain
UUIDs validated by the service — never a cross-module FK (docs/02 §2). Only
intra-module links (regulation ↔ clause ↔ gap/mapping, audit ↔ package) are real
foreign keys.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Date,
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


class Regulation(Base, TenantMixin, AuditFieldsMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "regulations"

    code: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    body: Mapped[str] = mapped_column(String(32), nullable=False, server_default="internal")
    # → documents(id) soft reference (the ingested source the clauses were parsed from)
    source_document_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    effective_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    edition: Mapped[str | None] = mapped_column(String(32), nullable=True)  # regulation's published version
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="active")

    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_regulations_tenant_code"),
    )


class RegulationClause(Base, TenantMixin, AuditFieldsMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "regulation_clauses"

    regulation_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("regulations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("regulation_clauses.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    clause_no: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str | None] = mapped_column(String(512), nullable=True)
    text: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    severity_default: Mapped[str] = mapped_column(String(16), nullable=False, server_default="medium")
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    path: Mapped[str | None] = mapped_column(String(255), nullable=True)  # "6 > 6.4" (tree breadcrumb)

    __table_args__ = (
        Index("ix_regulation_clauses_regulation_no", "regulation_id", "clause_no"),
    )


class ComplianceMapping(Base, TenantMixin, AuditFieldsMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "compliance_mappings"

    clause_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("regulation_clauses.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    target_type: Mapped[str] = mapped_column(String(16), nullable=False)  # procedure_doc|equipment|record
    target_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    target_label: Mapped[str | None] = mapped_column(String(512), nullable=True)  # denormalized for display
    mapping_confidence: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False, server_default="0")
    mapped_by: Mapped[str] = mapped_column(String(8), nullable=False, server_default="ai")  # ai|human
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="proposed")
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    citation: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")

    __table_args__ = (
        UniqueConstraint("clause_id", "target_type", "target_id",
                         name="uq_compliance_mappings_clause_target"),
        Index("ix_compliance_mappings_tenant_status", "tenant_id", "status"),
    )


class ComplianceGap(Base, TenantMixin, AuditFieldsMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "compliance_gaps"

    clause_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("regulation_clauses.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, server_default="medium")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    affected_equipment_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    affected_document_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, server_default="open")
    remediation_wo_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    detected_by: Mapped[str] = mapped_column(String(8), nullable=False, server_default="agent")  # agent|manual
    # Side-by-side detail the gap-detail screen renders: {clause, procedure, records, comparison}
    detail: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_compliance_gaps_tenant_status", "tenant_id", "status"),
    )


class Audit(Base, TenantMixin, AuditFieldsMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "audits"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(String(32), nullable=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    auditor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    scope: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="planned")
    checklist: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")


class EvidencePackage(Base, TenantMixin, AuditFieldsMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "evidence_packages"

    audit_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("audits.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    scope: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="generating")
    storage_key: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    summary: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")  # coverage
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Opaque token granting auditors read-only download without a login (docs/02 §19).
    share_token: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    generated_by: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
