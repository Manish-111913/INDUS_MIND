"""parts, work_order_parts, part_movements (docs/08 S12)."""

from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, Index, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.common.base import AuditFieldsMixin, Base, TenantMixin


class Part(Base, TenantMixin, AuditFieldsMixin):
    """A stock item. `on_hand` is a cached balance — the source of truth is the
    sum of `part_movements.delta`, so any change to on_hand must also write a
    movement (see PartService.adjust / consume_for_work_order)."""

    __tablename__ = "parts"

    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(32), nullable=True)  # lookups(type='units')
    min_stock: Mapped[float] = mapped_column(Numeric(14, 3), nullable=False, server_default="0")
    on_hand: Mapped[float] = mapped_column(Numeric(14, 3), nullable=False, server_default="0")
    location: Mapped[str | None] = mapped_column(String(128), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))

    __table_args__ = (UniqueConstraint("tenant_id", "code", name="uq_parts_tenant_code"),)


class WorkOrderPart(Base, TenantMixin, AuditFieldsMixin):
    """A part planned (and later used) against a work order."""

    __tablename__ = "work_order_parts"

    work_order_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("work_orders.id", ondelete="CASCADE"), nullable=False)
    part_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("parts.id", ondelete="RESTRICT"), nullable=False)
    qty_planned: Mapped[float] = mapped_column(Numeric(14, 3), nullable=False, server_default="0")
    qty_used: Mapped[float | None] = mapped_column(Numeric(14, 3), nullable=True)

    __table_args__ = (
        UniqueConstraint("work_order_id", "part_id", name="uq_work_order_parts_wo_part"),
        Index("ix_work_order_parts_wo", "work_order_id"),
    )


class PartMovement(Base, TenantMixin, AuditFieldsMixin):
    """Immutable stock-ledger entry. `delta` is signed (negative = consumed).

    Every on_hand change writes one of these, so the balance is auditable and
    reconstructable — never silently mutated.
    """

    __tablename__ = "part_movements"

    part_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("parts.id", ondelete="CASCADE"), nullable=False)
    delta: Mapped[float] = mapped_column(Numeric(14, 3), nullable=False)
    reason: Mapped[str] = mapped_column(String(16), nullable=False)  # wo_consume|adjustment|receipt
    ref_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)

    __table_args__ = (Index("ix_part_movements_part", "part_id", "created_at"),)
