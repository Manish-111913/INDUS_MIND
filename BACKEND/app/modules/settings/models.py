"""Settings models (docs/05 S1).

`settings_definitions` is a global catalog (metadata + system default) — no
tenant. `settings_values` holds overrides at a scope (tenant/plant/user); the
system default lives on the definition. Effective resolution merges
system → tenant → plant → user (user wins).
"""

from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.common.base import AuditFieldsMixin, Base, TenantMixin

VALUE_TYPES = ("string", "int", "bool", "json", "enum")
SCOPES = ("system", "tenant", "plant", "user")


class SettingDefinition(Base, AuditFieldsMixin):
    """Global definition of a configurable setting (metadata + system default)."""

    __tablename__ = "settings_definitions"

    key: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    value_type: Mapped[str] = mapped_column(String(16), nullable=False)  # string|int|bool|json|enum
    enum_options: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    default_value: Mapped[object] = mapped_column(JSONB, nullable=True)
    scope: Mapped[str] = mapped_column(String(16), nullable=False, server_default="system")
    category: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")


class SettingValue(Base, TenantMixin, AuditFieldsMixin):
    """An override of a definition at a tenant/plant/user scope."""

    __tablename__ = "settings_values"

    definition_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("settings_definitions.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    scope: Mapped[str] = mapped_column(String(16), nullable=False)  # tenant|plant|user
    scope_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    value: Mapped[object] = mapped_column(JSONB, nullable=True)

    __table_args__ = (
        UniqueConstraint("definition_id", "scope", "scope_id", name="uq_settings_value_scope"),
    )
