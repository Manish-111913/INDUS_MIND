"""Document models: documents, document_versions, ingestion_jobs (docs/02 §7).

`doc_type_id`/`plant_id` are soft references (lookups / equipment) validated via
service interfaces on write — no cross-module FKs (docs/02 §2). `search_vector`
is a generated tsvector over title+tags for metadata FTS (§7). document_chunks /
extracted_entities are ingestion concerns (B5/B6) and are not created here.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Computed,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.common.base import (
    AuditFieldsMixin,
    Base,
    SoftDeleteMixin,
    TenantMixin,
    VersionMixin,
)

# ingestion_status values (docs/02 §7)
INGESTION_STATES = (
    "pending", "ocr", "parsing", "chunking", "embedding",
    "extracting", "graphing", "completed", "failed",
)


class Document(Base, TenantMixin, AuditFieldsMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "documents"

    plant_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)  # → equipment
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    doc_type_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)  # → lookups
    source: Mapped[str] = mapped_column(String(16), nullable=False, server_default="upload")
    storage_key: Mapped[str] = mapped_column(String(1024), nullable=False)
    mime: Mapped[str] = mapped_column(String(255), nullable=False)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    checksum: Mapped[str | None] = mapped_column(String(128), nullable=True)
    language: Mapped[str | None] = mapped_column(String(16), nullable=True)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    current_version_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    ingestion_status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="pending")
    ingestion_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, server_default="{}")
    meta: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    # Generated FTS over title only — array_to_string is STABLE (locale-dependent)
    # so tags can't live in a generated column; tags are filtered via the GIN
    # array index (`tag` param) instead.
    search_vector: Mapped[str | None] = mapped_column(
        TSVECTOR,
        Computed("to_tsvector('english', coalesce(title, ''))", persisted=True),
        nullable=True,
    )

    __table_args__ = (
        Index("ix_documents_tenant_doc_type", "tenant_id", "doc_type_id"),
        Index("ix_documents_tags_gin", "tags", postgresql_using="gin"),
        Index("ix_documents_search_gin", "search_vector", postgresql_using="gin"),
    )


class DocumentVersion(Base, TenantMixin, AuditFieldsMixin):
    """Immutable version record; `version_no` is the domain version (no mixin version)."""

    __tablename__ = "document_versions"

    document_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(1024), nullable=False)
    mime: Mapped[str] = mapped_column(String(255), nullable=False)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    checksum: Mapped[str | None] = mapped_column(String(128), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("document_id", "version_no", name="uq_document_versions_doc_version"),
    )


class IngestionJob(Base, TenantMixin, AuditFieldsMixin):
    """Pipeline job with per-stage progress (docs/02 §7, §11)."""

    __tablename__ = "ingestion_jobs"

    document_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="pending")
    current_stage: Mapped[str | None] = mapped_column(String(32), nullable=True)
    stages: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    retries: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    worker_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    durations: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
