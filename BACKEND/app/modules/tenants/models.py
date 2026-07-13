"""Tenant model (docs/02 §7).

The tenant is the isolation root, so it does NOT carry `tenant_id` itself; it
keeps audit/soft-delete/version like every other business table.
"""

from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.common.base import AuditFieldsMixin, Base, SoftDeleteMixin, VersionMixin


class Tenant(Base, AuditFieldsMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, server_default="active")
    plan: Mapped[str] = mapped_column(String(32), nullable=False, server_default="free")
    settings: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
