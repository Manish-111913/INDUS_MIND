"""documents: documents, document_versions, ingestion_jobs

docs/02 §7, §12, §17. Adds the document tables with a generated tsvector
(title+tags) for metadata FTS, a GIN index on tags, and per-stage ingestion job
progress. document_chunks / extracted_entities belong to ingestion (B5/B6).

Revision ID: 0005_documents
Revises: 0004_equipment
Create Date: 2026-07-13
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005_documents"
down_revision: str | None = "0004_equipment"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UUID = postgresql.UUID(as_uuid=True)


def _base_cols() -> list[sa.Column]:
    return [
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
        sa.Column("created_by", _UUID, nullable=True),
        sa.Column("updated_by", _UUID, nullable=True),
    ]


def upgrade() -> None:
    # ── documents ────────────────────────────────────────────────────────────
    op.create_table(
        "documents",
        *_base_cols(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.BigInteger(), nullable=False, server_default="1"),
        sa.Column("plant_id", _UUID, nullable=True),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("doc_type_id", _UUID, nullable=True),
        sa.Column("source", sa.String(16), nullable=False, server_default="upload"),
        sa.Column("storage_key", sa.String(1024), nullable=False),
        sa.Column("mime", sa.String(255), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("checksum", sa.String(128), nullable=True),
        sa.Column("language", sa.String(16), nullable=True),
        sa.Column("uploaded_by", _UUID, nullable=True),
        sa.Column("current_version_id", _UUID, nullable=True),
        sa.Column("ingestion_status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("ingestion_error", sa.Text(), nullable=True),
        sa.Column("page_count", sa.Integer(), nullable=True),
        sa.Column("tags", postgresql.ARRAY(sa.String()), nullable=False, server_default="{}"),
        sa.Column("meta", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column(
            "search_vector",
            postgresql.TSVECTOR(),
            sa.Computed("to_tsvector('english', coalesce(title, ''))", persisted=True),
            nullable=True,
        ),
    )
    op.create_index("ix_documents_tenant_id", "documents", ["tenant_id"])
    op.create_index("ix_documents_deleted_at", "documents", ["deleted_at"])
    op.create_index("ix_documents_tenant_doc_type", "documents", ["tenant_id", "doc_type_id"])
    op.create_index("ix_documents_tags_gin", "documents", ["tags"], postgresql_using="gin")
    op.create_index("ix_documents_search_gin", "documents", ["search_vector"], postgresql_using="gin")

    # ── document_versions ────────────────────────────────────────────────────
    op.create_table(
        "document_versions",
        *_base_cols(),
        sa.Column("document_id", _UUID, sa.ForeignKey("documents.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("storage_key", sa.String(1024), nullable=False),
        sa.Column("mime", sa.String(255), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("checksum", sa.String(128), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("document_id", "version_no", name="uq_document_versions_doc_version"),
    )
    op.create_index("ix_document_versions_tenant_id", "document_versions", ["tenant_id"])
    op.create_index("ix_document_versions_document_id", "document_versions", ["document_id"])

    # ── ingestion_jobs ───────────────────────────────────────────────────────
    op.create_table(
        "ingestion_jobs",
        *_base_cols(),
        sa.Column("document_id", _UUID, sa.ForeignKey("documents.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("version_id", _UUID, nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("current_stage", sa.String(32), nullable=True),
        sa.Column("stages", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("retries", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("worker_id", sa.String(128), nullable=True),
        sa.Column("durations", postgresql.JSONB(), nullable=False, server_default="{}"),
    )
    op.create_index("ix_ingestion_jobs_tenant_id", "ingestion_jobs", ["tenant_id"])
    op.create_index("ix_ingestion_jobs_document_id", "ingestion_jobs", ["document_id"])


def downgrade() -> None:
    op.drop_table("ingestion_jobs")
    op.drop_table("document_versions")
    op.drop_table("documents")
