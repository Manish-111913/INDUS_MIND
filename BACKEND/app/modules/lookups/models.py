"""Lookup model — every dropdown/option set (docs/02 §7, §27).

tenant_id NULL = global default shared by all tenants; a tenant may add its own
rows in the same category. UQ(tenant, category, code).
"""

from __future__ import annotations

import uuid

from sqlalchemy import Boolean, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.common.base import AuditFieldsMixin, Base, SoftDeleteMixin, VersionMixin


class Lookup(Base, AuditFieldsMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "lookups"

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True, index=True)
    category: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    sort: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    meta: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    __table_args__ = (
        UniqueConstraint("tenant_id", "category", "code", name="uq_lookups_tenant_category_code"),
    )
