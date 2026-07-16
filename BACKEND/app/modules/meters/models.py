"""Meter models (docs/05 S5).

`meter_definitions` = a tenant's catalogue of measurable quantities (vibration,
bearing temp, …) with a normal band. `equipment_meters` attaches a definition to
a piece of equipment. `meter_readings` are the time-series points — indexed
(equipment_meter_id, recorded_at DESC) for fast last-N / range queries that the
condition charts and the predictor consume.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.common.base import AuditFieldsMixin, Base, SoftDeleteMixin, TenantMixin

READING_TYPES = ("gauge", "counter")
READING_SOURCES = ("manual", "import", "api")


class MeterDefinition(Base, TenantMixin, AuditFieldsMixin, SoftDeleteMixin):
    __tablename__ = "meter_definitions"

    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    unit_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)  # → lookups(units)
    unit: Mapped[str | None] = mapped_column(String(32), nullable=True)  # denormalised unit label
    reading_type: Mapped[str] = mapped_column(String(16), nullable=False, server_default="gauge")
    normal_min: Mapped[Decimal | None] = mapped_column(Numeric(14, 4), nullable=True)
    normal_max: Mapped[Decimal | None] = mapped_column(Numeric(14, 4), nullable=True)

    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_meter_definitions_tenant_code"),
    )


class EquipmentMeter(Base, TenantMixin, AuditFieldsMixin):
    __tablename__ = "equipment_meters"

    equipment_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("equipment.id", ondelete="CASCADE"),
        nullable=False, index=True)
    meter_definition_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("meter_definitions.id", ondelete="CASCADE"),
        nullable=False, index=True)

    __table_args__ = (
        UniqueConstraint("equipment_id", "meter_definition_id", name="uq_equipment_meter"),
    )


class MeterReading(Base, TenantMixin, AuditFieldsMixin):
    __tablename__ = "meter_readings"

    equipment_meter_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("equipment_meters.id", ondelete="CASCADE"),
        nullable=False)
    value: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source: Mapped[str] = mapped_column(String(16), nullable=False, server_default="manual")
    recorded_by: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)

    __table_args__ = (
        Index("ix_meter_readings_meter_recorded", "equipment_meter_id", "recorded_at"),
    )
