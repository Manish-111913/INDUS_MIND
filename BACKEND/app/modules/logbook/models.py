"""shift_logs (docs/08 S13)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.common.base import AuditFieldsMixin, Base, TenantMixin


class ShiftLog(Base, TenantMixin, AuditFieldsMixin):
    """A shift log. `draft` is editable by its author; once `submitted` it is
    immutable (edits become amendment notes) and has been ingested as a document
    (`document_id`), which is what makes it Copilot-citable."""

    __tablename__ = "shift_logs"

    plant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("plants.id", ondelete="CASCADE"), nullable=False)
    shift: Mapped[str] = mapped_column(String(32), nullable=False)  # lookups(type='shifts')
    log_date: Mapped[date] = mapped_column(Date, nullable=False)
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="draft")
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    document_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)

    __table_args__ = (
        UniqueConstraint("tenant_id", "plant_id", "shift", "log_date", "author_id",
                        name="uq_shift_logs_natural"),
        Index("ix_shift_logs_filter", "tenant_id", "plant_id", "log_date"),
    )
