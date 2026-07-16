"""retention_policies (docs/08 S14)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.common.base import AuditFieldsMixin, Base, TenantMixin

# Entities a retention policy may govern. Each maps to a table + a timestamp
# column in the retention runner's registry — keep the two in lockstep.
RETENTION_ENTITIES = (
    "audit_log", "notifications", "chat_sessions", "ingestion_jobs",
    "webhook_deliveries", "ai_usage", "report_runs",
)


class RetentionPolicy(Base, TenantMixin, AuditFieldsMixin):
    __tablename__ = "retention_policies"

    entity: Mapped[str] = mapped_column(String(32), nullable=False)
    keep_days: Mapped[int] = mapped_column(Integer, nullable=False)
    action: Mapped[str] = mapped_column(String(16), nullable=False)  # archive|delete
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_affected: Mapped[int | None] = mapped_column(Integer, nullable=True)

    __table_args__ = (UniqueConstraint("tenant_id", "entity", name="uq_retention_tenant_entity"),)
