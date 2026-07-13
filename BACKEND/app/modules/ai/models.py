"""AI configuration models: ai_model_configs, prompt_templates, llm_usage.

docs/02 §7, §37, §38. Model choice and prompts are DB-configured, never hardcoded
— core/llm.py resolves capability → active config at call time. `tenant_id NULL`
rows are global defaults (a tenant may override per capability/key). llm_usage
meters tokens per tenant/capability for the cost dashboard.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.common.base import (
    AuditFieldsMixin,
    Base,
    SoftDeleteMixin,
    TenantMixin,
    VersionMixin,
)

CAPABILITIES = ("chat", "embedding", "ocr_vision", "extraction", "rca", "compliance", "lessons")


class AIModelConfig(Base, AuditFieldsMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "ai_model_configs"

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True, index=True)
    capability: Mapped[str] = mapped_column(String(32), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)  # anthropic|openai|ollama
    model_name: Mapped[str] = mapped_column(String(128), nullable=False)
    params: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    confidence_threshold: Mapped[float] = mapped_column(Numeric(4, 3), nullable=False,
                                                        server_default="0.700")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    fallback_config_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)


class PromptTemplate(Base, AuditFieldsMixin, SoftDeleteMixin, VersionMixin):
    __tablename__ = "prompt_templates"

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True, index=True)
    key: Mapped[str] = mapped_column(String(64), nullable=False)
    capability: Mapped[str] = mapped_column(String(32), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    template: Mapped[str] = mapped_column(Text, nullable=False)
    variables: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("tenant_id", "key", "version", name="uq_prompt_templates_tenant_key_version"),
    )


class LLMUsage(Base, AuditFieldsMixin):
    __tablename__ = "llm_usage"

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True, index=True)
    capability: Mapped[str] = mapped_column(String(32), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    model_name: Mapped[str] = mapped_column(String(128), nullable=False)
    prompt_tokens: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    completion_tokens: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    total_tokens: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    logged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(),
                                                nullable=False)


class ChatSession(Base, TenantMixin, AuditFieldsMixin, SoftDeleteMixin):
    __tablename__ = "chat_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False, index=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    scope: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")


class ChatMessage(Base, TenantMixin, AuditFieldsMixin):
    __tablename__ = "chat_messages"

    session_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("chat_sessions.id", ondelete="CASCADE"),
        nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(16), nullable=False)  # user | assistant | system
    content: Mapped[str] = mapped_column(Text, nullable=False)
    citations: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    confidence: Mapped[float | None] = mapped_column(Numeric(4, 3), nullable=True)
    confidence_level: Mapped[str | None] = mapped_column(String(8), nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    token_usage: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    prompt_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cached: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    feedback: Mapped[str | None] = mapped_column(String(8), nullable=True)  # up | down
    feedback_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (Index("ix_chat_messages_session_created", "session_id", "created_at"),)


class AIInsight(Base, TenantMixin, AuditFieldsMixin, SoftDeleteMixin):
    """Dashboard AI cards — populated by agents/schedulers (docs/02 §15, §21)."""

    __tablename__ = "ai_insights"

    role: Mapped[str | None] = mapped_column(String(64), nullable=True)  # role-scoped; NULL = all
    category: Mapped[str] = mapped_column(String(48), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float | None] = mapped_column(Numeric(4, 3), nullable=True)
    evidence: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    actions: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    entity_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")


class EvalRun(Base, TenantMixin, AuditFieldsMixin):
    __tablename__ = "eval_runs"

    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="completed")
    summary: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    results: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
