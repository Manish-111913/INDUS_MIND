"""Identity models: users, refresh_tokens, sessions (docs/02 §6, §7).

`refresh_tokens` and `sessions` use `revoked_at` as their lifecycle column
rather than the soft-delete/version mixins — they are event-log-like and never
edited in place. Both still carry tenant_id + audit fields for isolation and RLS.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.common.base import (
    AuditFieldsMixin,
    Base,
    SoftDeleteMixin,
    TenantMixin,
    VersionMixin,
)


class User(Base, TenantMixin, AuditFieldsMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)  # NULL for SSO
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, server_default="active")
    mfa_secret: Mapped[str | None] = mapped_column(String(512), nullable=True)  # Fernet-encrypted
    token_version: Mapped[int] = mapped_column(nullable=False, server_default="0")
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    locale: Mapped[str] = mapped_column(String(16), nullable=False, server_default="en")
    theme: Mapped[str] = mapped_column(String(16), nullable=False, server_default="light")

    __table_args__ = (
        UniqueConstraint("tenant_id", "email", name="uq_users_tenant_email"),
        Index("ix_users_tenant_email", "tenant_id", "email"),
    )

    @property
    def mfa_enabled(self) -> bool:
        return self.mfa_secret is not None


class Session(Base, TenantMixin, AuditFieldsMixin):
    __tablename__ = "sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    device: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ua: Mapped[str | None] = mapped_column(String(512), nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    tokens: Mapped[list["RefreshToken"]] = relationship(back_populates="session")

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None


class RefreshToken(Base, TenantMixin, AuditFieldsMixin):
    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)  # SHA-256 hex
    family_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    device: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)

    session: Mapped[Session | None] = relationship(back_populates="tokens")

    __table_args__ = (Index("ix_refresh_tokens_token_hash", "token_hash"),)
