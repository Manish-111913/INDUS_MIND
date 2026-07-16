"""tours, tour_steps, changelog_entries (docs/05 S10)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.common.base import AuditFieldsMixin, Base


class Tour(Base, AuditFieldsMixin):
    """A guided product tour, addressed by `code` (e.g. "main").

    `tenant_id` is NULLable — unlike most tables here — because a tour is content
    shipped with the product. NULL means system-provided and visible to every
    tenant; a row with a tenant_id overrides it for that tenant.
    """

    __tablename__ = "tours"

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), nullable=True, index=True)
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Auto-offer this tour to one role only; NULL = everyone.
    role_scope: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))

    steps: Mapped[list[TourStep]] = relationship(
        back_populates="tour", cascade="all, delete-orphan",
        order_by="TourStep.order_no", lazy="selectin")

    __table_args__ = (UniqueConstraint("tenant_id", "code", name="uq_tours_tenant_code"),)


class TourStep(Base, AuditFieldsMixin):
    """One stop on a tour. `selector` is the CSS target the driver highlights."""

    __tablename__ = "tour_steps"

    tour_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("tours.id", ondelete="CASCADE"), nullable=False)
    order_no: Mapped[int] = mapped_column(Integer, nullable=False)
    selector: Mapped[str | None] = mapped_column(String(256), nullable=True)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    placement: Mapped[str | None] = mapped_column(String(16), nullable=True)

    tour: Mapped[Tour] = relationship(back_populates="steps")

    __table_args__ = (UniqueConstraint("tour_id", "order_no", name="uq_tour_steps_tour_order"),)


class ChangelogEntry(Base, AuditFieldsMixin):
    """A "What's new" item. NULL tenant_id = system-wide (the usual case)."""

    __tablename__ = "changelog_entries"

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), nullable=True, index=True)
    version: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    body_md: Mapped[str] = mapped_column(Text, nullable=False)
    released_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now())
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
