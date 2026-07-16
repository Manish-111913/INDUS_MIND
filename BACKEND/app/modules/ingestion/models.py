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
    Boolean,
    Computed,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
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
    # Provenance (docs/05 S7): which extraction_rule produced this row, at which
    # version. Nullable because the LLM pass yields entities no single rule owns.
    # rule_version is a snapshot, not an FK — the rule may be edited (and its
    # version bumped) after this row was written, and we must still be able to say
    # which text of the rule matched.
    rule_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("extraction_rules.id", ondelete="SET NULL"),
        nullable=True, index=True
    )
    rule_version: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # document_id is indexed via index=True on the column above.
    __table_args__ = (
        Index("ix_extracted_entities_type_norm", "entity_type", "normalized_value"),
    )


class ExtractionRule(Base, TenantMixin, AuditFieldsMixin, VersionMixin):
    """A tenant-authored entity-extraction rule (docs/05 S7).

    Replaces the regexes that used to be literals in `extraction.py`: every plant
    has its own tag convention, so the patterns are data. `version` (VersionMixin)
    doubles as the rule version stamped onto `extracted_entities.rule_version` —
    bumping it on edit is what makes re-ingestion produce a new entity generation.

    `method`:
      · regex   — `pattern` is a Python regex; each match is a candidate
      · keyword — `pattern` is a newline/comma-separated gazetteer of literals
      · llm     — contributes `llm_hint` to the extraction prompt instead of matching
    """

    __tablename__ = "extraction_rules"

    # Free text rather than an FK: entity_type is a lookups(type='entity_types')
    # code, and lookups are tenant-editable rows, not an enum.
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)
    method: Mapped[str] = mapped_column(String(16), nullable=False)  # regex|keyword|llm
    pattern: Mapped[str | None] = mapped_column(Text, nullable=True)
    llm_hint: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Lower runs first; ties broken by created_at so ordering is deterministic.
    priority: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("100"))
    confidence: Mapped[float] = mapped_column(Numeric(4, 3), nullable=False, server_default=text("0.7"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_extraction_rules_tenant_active", "tenant_id", "is_active", "priority"),
    )
