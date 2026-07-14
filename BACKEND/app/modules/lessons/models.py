"""Lessons model (docs/02 §7, §10).

`evidence` is the cited record list ([{type,id,excerpt}]); `affected_equipment_ids`
is the UUID[] of equipment the pattern spans; `pattern_key` is a stable signature
(theme + equipment set) used to keep the agent idempotent across re-runs.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.common.base import (
    AuditFieldsMixin,
    Base,
    SoftDeleteMixin,
    TenantMixin,
    VersionMixin,
)


class Lesson(Base, TenantMixin, AuditFieldsMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "lessons"

    title: Mapped[str] = mapped_column(String(512), nullable=False)
    narrative: Mapped[str | None] = mapped_column(Text, nullable=True)
    pattern_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    pattern_key: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    evidence: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    affected_equipment_ids: Mapped[list] = mapped_column(
        ARRAY(PG_UUID(as_uuid=True)), nullable=False, server_default="{}")
    recommended_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(4, 3), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="candidate")
    source: Mapped[str] = mapped_column(String(16), nullable=False, server_default="agent")
    prompt_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_by: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
