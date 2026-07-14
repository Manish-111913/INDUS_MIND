"""Notification models: notifications, notification_preferences, notification_rules.

docs/02 §7, §20, §34. `notifications` is the in-app inbox row (also the audit of
what was sent, via `channels_sent`). `notification_preferences` gate email/push
per category per user (the matrix the frontend renders). `notification_rules` is
the DB-configured routing table an event-bus subscriber consumes: event_type →
category + priority + audience (roles / assignee / subscribers) + channels. Rules
with `tenant_id NULL` are global defaults a tenant may override.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.common.base import AuditFieldsMixin, Base, SoftDeleteMixin, TenantMixin

CHANNELS = ("in_app", "email", "push")


class Notification(Base, TenantMixin, AuditFieldsMixin):
    __tablename__ = "notifications"

    user_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(48), nullable=False)  # → lookups(notification_categories)
    priority: Mapped[str] = mapped_column(String(16), nullable=False, server_default="normal")
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    entity_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    channels_sent: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")

    __table_args__ = (
        Index("ix_notifications_user_read", "user_id", "read_at"),
        Index("ix_notifications_tenant_category", "tenant_id", "category"),
    )


class NotificationPreference(Base, TenantMixin, AuditFieldsMixin):
    __tablename__ = "notification_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(48), nullable=False)
    channel: Mapped[str] = mapped_column(String(16), nullable=False)  # in_app | email | push
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    __table_args__ = (
        UniqueConstraint("user_id", "category", "channel", name="uq_notif_pref_user_cat_channel"),
    )


class NotificationRule(Base, AuditFieldsMixin, SoftDeleteMixin):
    """Routing rule: event_type → category/priority/audience/channels (DB-configured)."""

    __tablename__ = "notification_rules"

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(48), nullable=False)
    priority: Mapped[str] = mapped_column(String(16), nullable=False, server_default="normal")
    # audience: list of specs — "assignee" | "actor" | "subscribers" | "role:<Name>" | "user:<uuid>"
    audience: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    channels: Mapped[list] = mapped_column(JSONB, nullable=False, server_default='["in_app"]')
    title_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
