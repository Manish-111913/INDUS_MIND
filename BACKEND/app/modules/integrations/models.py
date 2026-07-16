"""api_keys, webhook_endpoints, webhook_deliveries (docs/05 S8)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.common.base import AuditFieldsMixin, Base, TenantMixin


class ApiKey(Base, TenantMixin, AuditFieldsMixin):
    """A machine principal. The plaintext key is shown once at creation and never
    stored: only its SHA-256 (`key_hash`, what authentication looks up) and a
    display fragment (`key_prefix`, so a human can tell two keys apart in the UI).
    """

    __tablename__ = "api_keys"

    name: Mapped[str] = mapped_column(String(128), nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    # Permission codes this key may exercise — the API-key equivalent of a role.
    scopes: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))


class WebhookEndpoint(Base, TenantMixin, AuditFieldsMixin):
    """An external URL subscribing to `event_codes`. `secret` signs the body."""

    __tablename__ = "webhook_endpoints"

    name: Mapped[str] = mapped_column(String(128), nullable=False)
    url: Mapped[str] = mapped_column(String(1024), nullable=False)
    secret: Mapped[str] = mapped_column(String(128), nullable=False)
    event_codes: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))


class WebhookDelivery(Base, TenantMixin, AuditFieldsMixin):
    """One attempt-tracked delivery of one event to one endpoint.

    `status`: pending → delivering → delivered | retrying → … → failed.
    `next_retry_at` drives the sweeper; a terminal row has it NULL.
    """

    __tablename__ = "webhook_deliveries"

    endpoint_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("webhook_endpoints.id", ondelete="CASCADE"),
        nullable=False
    )
    event_code: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="pending")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    response_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_webhook_deliveries_endpoint", "endpoint_id", "created_at"),
        Index("ix_webhook_deliveries_due", "status", "next_retry_at"),
    )
