"""content_pages (docs/08 N5)."""

from __future__ import annotations

import uuid

from sqlalchemy import Boolean, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.common.base import AuditFieldsMixin, Base


class ContentPage(Base, AuditFieldsMixin):
    """A markdown page addressed by slug. NULL tenant_id = system page (the
    default privacy/terms); a tenant may override a slug with its own row.

    `is_public` pages (privacy/terms) are the only ones served without auth."""

    __tablename__ = "content_pages"

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), nullable=True, index=True)
    slug: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    body_md: Mapped[str] = mapped_column(Text, nullable=False)
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))

    __table_args__ = (UniqueConstraint("tenant_id", "slug", name="uq_content_pages_tenant_slug"),)
