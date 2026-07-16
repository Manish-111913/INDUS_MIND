"""Preferences models (docs/05 S2).

`user_preferences` persists per-user UI state keyed by an arbitrary string
(e.g. "table:work_orders" → {columns, sort, density}). `saved_views` are named,
optionally-shared filter/column/sort presets scoped to an entity. Shared views
are visible tenant-wide; only the owner or `views.manage` may mutate them.
"""

from __future__ import annotations

import uuid

from sqlalchemy import Boolean, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.common.base import AuditFieldsMixin, Base, SoftDeleteMixin, TenantMixin

# Entities that support saved views (docs/05 S2).
VIEW_ENTITIES = (
    "work_orders", "documents", "equipment", "failures", "ncrs",
    "regulations", "compliance_gaps", "lessons", "predictions",
)


class UserPreference(Base, TenantMixin, AuditFieldsMixin):
    __tablename__ = "user_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False, index=True)
    key: Mapped[str] = mapped_column(String(128), nullable=False)
    value: Mapped[object] = mapped_column(JSONB, nullable=False, server_default="{}")

    __table_args__ = (
        UniqueConstraint("user_id", "key", name="uq_user_preferences_user_key"),
    )


class SavedView(Base, TenantMixin, AuditFieldsMixin, SoftDeleteMixin):
    __tablename__ = "saved_views"

    user_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False, index=True)
    entity: Mapped[str] = mapped_column(String(48), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    filters: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    columns: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    sort: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    is_shared: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
