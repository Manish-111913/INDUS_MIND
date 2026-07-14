"""Dashboard models: widget_registry, dashboard_configs (docs/02 §7, §21).

`widget_registry` is global (tenant-agnostic catalog). `dashboard_configs` scope a
layout to a role (`role_id`, the tenant default) or a user (`user_id`, personal
override); `GET /dashboards/config` merges the personal override onto the role
default.
"""

from __future__ import annotations

import uuid

from sqlalchemy import Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.common.base import AuditFieldsMixin, Base, SoftDeleteMixin, TenantMixin, VersionMixin


class WidgetRegistry(Base, AuditFieldsMixin):
    __tablename__ = "widget_registry"

    key: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False)  # kpi|chart|table|list|heatmap
    data_endpoint: Mapped[str] = mapped_column(String(255), nullable=False)
    default_params: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    required_permission: Mapped[str | None] = mapped_column(String(64), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")


class DashboardConfig(Base, TenantMixin, AuditFieldsMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "dashboard_configs"

    role_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True, index=True)
    layout: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")

    __table_args__ = (
        Index("ix_dashboard_configs_tenant_role", "tenant_id", "role_id"),
        Index("ix_dashboard_configs_tenant_user", "tenant_id", "user_id"),
    )
