"""Quality models: ncrs (non-conformance reports / deviations) — docs/02 §7, §21.

`defect_type_id` is a soft reference to `lookups` (category ``defect_types``);
`area_id`/`equipment_id` are soft references validated by the service. `capa`
holds the corrective/preventive action plan JSON. NCRs feed the defect-Pareto /
deviation-rate trends and the lessons pattern detector.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Index, String, Text, UniqueConstraint
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


class NCR(Base, TenantMixin, AuditFieldsMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "ncrs"

    ncr_number: Mapped[str] = mapped_column(String(32), nullable=False)
    area_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True, index=True)
    line: Mapped[str | None] = mapped_column(String(64), nullable=True)  # production line label
    defect_type_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, server_default="minor")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    equipment_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="open")
    capa: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("tenant_id", "ncr_number", name="uq_ncrs_tenant_number"),
        Index("ix_ncrs_tenant_status", "tenant_id", "status"),
        Index("ix_ncrs_defect_type", "tenant_id", "defect_type_id"),
    )
