"""Declarative base + the mandatory mixins for every business table (docs/02 §7).

Global conventions enforced here so no model can drift:
  · UUID pk (`gen_random_uuid()`)
  · tenant_id UUID NOT NULL (composite indexes lead with it — models add those)
  · created_at / updated_at / created_by / updated_by
  · deleted_at (soft delete) · version INT (optimistic locking)

Compose the mixins per table, e.g.:
    class Equipment(Base, TenantMixin, AuditFieldsMixin, SoftDeleteMixin, VersionMixin):
        __tablename__ = "equipment"
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, func, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Root declarative base. Every model carries a UUID pk by default."""

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )


class TenantMixin:
    """`tenant_id` present on all business tables; repository auto-filters on it."""

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), nullable=False, index=True
    )


class AuditFieldsMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)


class SoftDeleteMixin:
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None


class VersionMixin:
    """Optimistic locking. Bump on every mutation; mismatch → 409 VERSION_MISMATCH."""

    version: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default=text("1"))
