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

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.common.base import AuditFieldsMixin, Base, SoftDeleteMixin, TenantMixin

CHANNELS = ("in_app", "email", "push")
DIGEST_MODES = ("instant", "daily", "off")

# Canonical event codes that carry user-facing notifications (docs/05 S3). Every
# code has a seeded system template + is a row in the notification-preference
# matrix. Tenants may override templates per code.
EVENT_CODES = (
    "workorder.assigned",
    "workorder.created",
    "prediction.created",
    "rca.published",
    "lesson.published",
    "document.ingested",
    "gap.detected",
    "ncr.created",
    "maintenance.schedule_due",
    "notification.broadcast",
    "export.completed",
    "report.ready",
)


class Notification(Base, TenantMixin, AuditFieldsMixin):
    __tablename__ = "notifications"

    user_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(48), nullable=False)  # → lookups(notification_categories)
    event_code: Mapped[str | None] = mapped_column(String(64), nullable=True)  # source event (S3 digest)
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


class NotificationEventPreference(Base, TenantMixin, AuditFieldsMixin):
    """Per-user, per-event delivery preference (docs/05 S3).

    Distinct from the category×channel `notification_preferences` table (02 §20):
    this is the event-code matrix the S3 frontend renders — In-app / Email toggles
    plus a digest mode (instant | daily | off).
    """

    __tablename__ = "notification_event_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False, index=True)
    event_code: Mapped[str] = mapped_column(String(64), nullable=False)
    in_app: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    email: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    digest: Mapped[str] = mapped_column(String(16), nullable=False, server_default="instant")

    __table_args__ = (
        UniqueConstraint("user_id", "event_code", name="uq_notif_event_pref_user_event"),
    )


class NotificationTemplate(Base, AuditFieldsMixin, SoftDeleteMixin):
    """Jinja2-rendered message template per (event_code, channel, locale).

    tenant_id NULL = system template; a tenant row with the same key overrides it.
    """

    __tablename__ = "notification_templates"

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True, index=True)
    event_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    channel: Mapped[str] = mapped_column(String(16), nullable=False)  # in_app | email | webhook
    locale: Mapped[str] = mapped_column(String(16), nullable=False, server_default="en")
    subject_tpl: Mapped[str | None] = mapped_column(Text, nullable=True)
    body_tpl: Mapped[str] = mapped_column(Text, nullable=False)
    sample_payload: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")

    __table_args__ = (
        UniqueConstraint("tenant_id", "event_code", "channel", "locale",
                         name="uq_notif_template_scope"),
    )


class OutboundEmailLog(Base, TenantMixin, AuditFieldsMixin):
    """Audit of every email dispatch attempt (docs/05 S3)."""

    __tablename__ = "outbound_email_log"

    to_email: Mapped[str] = mapped_column(String(320), nullable=False)
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("notification_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    subject: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False)  # sent | failed
    provider_msg_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_outbound_email_tenant_created", "tenant_id", "created_at"),
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
