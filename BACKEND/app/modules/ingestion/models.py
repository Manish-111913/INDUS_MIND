"""document_chunks — the ingestion output: text + pgvector embedding (docs/02 §7, §10).

Owned by the ingestion module (it produces chunks); the knowledge/search module
(B7) queries them through this module's repository. `embedding` is VECTOR(1024)
(bge-large dim); `checksum` makes embedding idempotent (§10 step 4); `search_vector`
is a generated tsvector over the chunk text for hybrid FTS (§10 step 8).
"""

from __future__ import annotations

import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Computed,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.common.base import AuditFieldsMixin, Base, TenantMixin, VersionMixin
from app.core.embeddings import EMBEDDING_DIM

# extracted_entities enums (docs/02 §7)
ENTITY_TYPES = (
    "equipment_tag", "parameter", "regulation_ref", "person",
    "date", "material", "failure_mode", "procedure_ref",
)
ENTITY_STATUSES = ("auto", "confirmed", "corrected", "rejected")


class DocumentChunk(Base, TenantMixin, AuditFieldsMixin):
    __tablename__ = "document_chunks"

    document_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    page_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    token_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBEDDING_DIM), nullable=True)
    section_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    bbox: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)  # sha256 of text → idempotency
    search_vector: Mapped[str | None] = mapped_column(
        TSVECTOR,
        Computed("to_tsvector('english', coalesce(text, ''))", persisted=True),
        nullable=True,
    )

    # document_id is indexed via index=True on the column above.
    __table_args__ = (
        UniqueConstraint("version_id", "chunk_index", name="uq_chunk_version_index"),
        Index("ix_document_chunks_search_gin", "search_vector", postgresql_using="gin"),
    )


class ExtractedEntity(Base, TenantMixin, AuditFieldsMixin, VersionMixin):
    """Extracted entity with human-in-the-loop status (docs/02 §7, §10 step 6).

    `linked_record_type`/`linked_record_id` is a polymorphic link (e.g. an
    equipment row) set when a tag resolves above the confidence threshold.
    """

    __tablename__ = "extracted_entities"

    document_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    chunk_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_value: Mapped[str | None] = mapped_column(String(512), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Numeric(4, 3), nullable=True)
    page_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bbox: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="auto")
    linked_record_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    linked_record_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)

    # document_id is indexed via index=True on the column above.
    __table_args__ = (
        Index("ix_extracted_entities_type_norm", "entity_type", "normalized_value"),
    )
