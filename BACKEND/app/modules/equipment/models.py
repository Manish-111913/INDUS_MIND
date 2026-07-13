"""Asset models: plants, areas, equipment (docs/02 §7).

Equipment carries a self-referential `parent_id` for the Plant→Area→Unit→
Equipment→Component hierarchy (docs/01 §6). `type_id` is a soft reference to a
`lookups` row (category ``equipment_types``); `criticality`/`status` are lookup
codes — validated via the lookups service on write, not by a cross-module FK
(docs/02 §2). Postgres stays source of truth; the graph is a projection.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Index, Numeric, String, UniqueConstraint
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


class Plant(Base, TenantMixin, AuditFieldsMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "plants"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, server_default="Asia/Kolkata")

    # tenant_id is indexed by TenantMixin (ix_plants_tenant_id).
    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_plants_tenant_code"),
    )


class Area(Base, TenantMixin, AuditFieldsMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "areas"

    plant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("plants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(64), nullable=False)

    # tenant_id is indexed by TenantMixin (ix_areas_tenant_id).
    __table_args__ = (
        UniqueConstraint("plant_id", "code", name="uq_areas_plant_code"),
    )


class Equipment(Base, TenantMixin, AuditFieldsMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "equipment"

    plant_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("plants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    area_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("areas.id", ondelete="SET NULL"), nullable=True, index=True
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("equipment.id", ondelete="SET NULL"), nullable=True, index=True
    )
    tag: Mapped[str] = mapped_column(String(128), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)  # → lookups
    criticality: Mapped[str] = mapped_column(String(8), nullable=False, server_default="C")  # A/B/C
    status: Mapped[str] = mapped_column(String(32), nullable=False, server_default="operational")
    manufacturer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    serial_no: Mapped[str | None] = mapped_column(String(255), nullable=True)
    install_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    specs: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    health_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    health_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("tenant_id", "tag", name="uq_equipment_tenant_tag"),
        Index("ix_equipment_tenant_tag", "tenant_id", "tag"),
    )
