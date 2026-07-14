"""compliance: regulations, regulation_clauses, compliance_mappings,
compliance_gaps, audits, evidence_packages

docs/02 §7, §19. Regulation clause trees, the AI mapping/gap agent output, audits
and downloadable evidence packages. Cross-module references stay soft UUIDs
(docs/02 §2); only intra-module links are real FKs.

Revision ID: 0012_compliance
Revises: 0011_predictions_rca
Create Date: 2026-07-14
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0012_compliance"
down_revision: str | None = "0011_predictions_rca"
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
        sa.Column("version", sa.BigInteger(), nullable=False, server_default=sa.text("1")),
    ]


def upgrade() -> None:
    # ── regulations ──────────────────────────────────────────────────────────
    op.create_table(
        "regulations",
        *_base(),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("body", sa.String(32), nullable=False, server_default="internal"),
        sa.Column("source_document_id", _UUID, nullable=True),
        sa.Column("effective_date", sa.Date(), nullable=True),
        sa.Column("edition", sa.String(32), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.UniqueConstraint("tenant_id", "code", name="uq_regulations_tenant_code"),
    )
    op.create_index("ix_regulations_tenant_id", "regulations", ["tenant_id"])
    op.create_index("ix_regulations_deleted_at", "regulations", ["deleted_at"])

    # ── regulation_clauses (self-referential tree) ───────────────────────────
    op.create_table(
        "regulation_clauses",
        *_base(),
        sa.Column("regulation_id", _UUID, sa.ForeignKey("regulations.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("parent_id", _UUID,
                  sa.ForeignKey("regulation_clauses.id", ondelete="SET NULL"), nullable=True),
        sa.Column("clause_no", sa.String(32), nullable=False),
        sa.Column("title", sa.String(512), nullable=True),
        sa.Column("text", sa.Text(), nullable=False, server_default=""),
        sa.Column("category", sa.String(64), nullable=True),
        sa.Column("severity_default", sa.String(16), nullable=False, server_default="medium"),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("path", sa.String(255), nullable=True),
    )
    op.create_index("ix_regulation_clauses_tenant_id", "regulation_clauses", ["tenant_id"])
    op.create_index("ix_regulation_clauses_regulation_id", "regulation_clauses", ["regulation_id"])
    op.create_index("ix_regulation_clauses_parent_id", "regulation_clauses", ["parent_id"])
    op.create_index("ix_regulation_clauses_deleted_at", "regulation_clauses", ["deleted_at"])
    op.create_index("ix_regulation_clauses_regulation_no", "regulation_clauses",
                    ["regulation_id", "clause_no"])

    # ── compliance_mappings ──────────────────────────────────────────────────
    op.create_table(
        "compliance_mappings",
        *_base(),
        sa.Column("clause_id", _UUID,
                  sa.ForeignKey("regulation_clauses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_type", sa.String(16), nullable=False),
        sa.Column("target_id", _UUID, nullable=False),
        sa.Column("target_label", sa.String(512), nullable=True),
        sa.Column("mapping_confidence", sa.Numeric(4, 3), nullable=False, server_default="0"),
        sa.Column("mapped_by", sa.String(8), nullable=False, server_default="ai"),
        sa.Column("status", sa.String(16), nullable=False, server_default="proposed"),
        sa.Column("rationale", sa.Text(), nullable=True),
        sa.Column("citation", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.UniqueConstraint("clause_id", "target_type", "target_id",
                            name="uq_compliance_mappings_clause_target"),
    )
    op.create_index("ix_compliance_mappings_tenant_id", "compliance_mappings", ["tenant_id"])
    op.create_index("ix_compliance_mappings_clause_id", "compliance_mappings", ["clause_id"])
    op.create_index("ix_compliance_mappings_deleted_at", "compliance_mappings", ["deleted_at"])
    op.create_index("ix_compliance_mappings_tenant_status", "compliance_mappings",
                    ["tenant_id", "status"])

    # ── compliance_gaps ──────────────────────────────────────────────────────
    op.create_table(
        "compliance_gaps",
        *_base(),
        sa.Column("clause_id", _UUID,
                  sa.ForeignKey("regulation_clauses.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("severity", sa.String(16), nullable=False, server_default="medium"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("ai_explanation", sa.Text(), nullable=True),
        sa.Column("affected_equipment_id", _UUID, nullable=True),
        sa.Column("affected_document_id", _UUID, nullable=True),
        sa.Column("owner_id", _UUID, nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(24), nullable=False, server_default="open"),
        sa.Column("remediation_wo_id", _UUID, nullable=True),
        sa.Column("detected_by", sa.String(8), nullable=False, server_default="agent"),
        sa.Column("detail", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_compliance_gaps_tenant_id", "compliance_gaps", ["tenant_id"])
    op.create_index("ix_compliance_gaps_clause_id", "compliance_gaps", ["clause_id"])
    op.create_index("ix_compliance_gaps_deleted_at", "compliance_gaps", ["deleted_at"])
    op.create_index("ix_compliance_gaps_tenant_status", "compliance_gaps", ["tenant_id", "status"])

    # ── audits ───────────────────────────────────────────────────────────────
    op.create_table(
        "audits",
        *_base(),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("body", sa.String(32), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("auditor", sa.String(255), nullable=True),
        sa.Column("scope", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("status", sa.String(16), nullable=False, server_default="planned"),
        sa.Column("checklist", postgresql.JSONB(), nullable=False, server_default="[]"),
    )
    op.create_index("ix_audits_tenant_id", "audits", ["tenant_id"])
    op.create_index("ix_audits_deleted_at", "audits", ["deleted_at"])

    # ── evidence_packages ────────────────────────────────────────────────────
    op.create_table(
        "evidence_packages",
        *_base(),
        sa.Column("audit_id", _UUID, sa.ForeignKey("audits.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(255), nullable=True),
        sa.Column("scope", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("status", sa.String(16), nullable=False, server_default="generating"),
        sa.Column("storage_key", sa.String(1024), nullable=True),
        sa.Column("summary", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("share_token", sa.String(64), nullable=True),
        sa.Column("generated_by", _UUID, nullable=True),
    )
    op.create_index("ix_evidence_packages_tenant_id", "evidence_packages", ["tenant_id"])
    op.create_index("ix_evidence_packages_deleted_at", "evidence_packages", ["deleted_at"])
    op.create_index("ix_evidence_packages_share_token", "evidence_packages", ["share_token"])


def downgrade() -> None:
    op.drop_table("evidence_packages")
    op.drop_table("audits")
    op.drop_table("compliance_gaps")
    op.drop_table("compliance_mappings")
    op.drop_table("regulation_clauses")
    op.drop_table("regulations")
