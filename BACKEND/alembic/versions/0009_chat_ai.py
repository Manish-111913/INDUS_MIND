"""copilot chat + insights + eval runs

docs/02 §7, §15, §16. chat_sessions, chat_messages (citations/confidence/usage),
ai_insights (dashboard cards), eval_runs (benchmark history).

Revision ID: 0009_chat_ai
Revises: 0008_saved_searches
Create Date: 2026-07-13
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009_chat_ai"
down_revision: str | None = "0008_saved_searches"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UUID = postgresql.UUID(as_uuid=True)


def _audit() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
        sa.Column("created_by", _UUID, nullable=True),
        sa.Column("updated_by", _UUID, nullable=True),
    ]


def upgrade() -> None:
    op.create_table(
        "chat_sessions",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_id", _UUID, nullable=False),
        sa.Column("title", sa.String(255), nullable=True),
        sa.Column("scope", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("pinned", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index("ix_chat_sessions_tenant_id", "chat_sessions", ["tenant_id"])
    op.create_index("ix_chat_sessions_user_id", "chat_sessions", ["user_id"])

    op.create_table(
        "chat_messages",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit(),
        sa.Column("session_id", _UUID, sa.ForeignKey("chat_sessions.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("citations", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("confidence", sa.Numeric(4, 3), nullable=True),
        sa.Column("confidence_level", sa.String(8), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("token_usage", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("prompt_version", sa.Integer(), nullable=True),
        sa.Column("cached", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("feedback", sa.String(8), nullable=True),
        sa.Column("feedback_reason", sa.Text(), nullable=True),
    )
    op.create_index("ix_chat_messages_tenant_id", "chat_messages", ["tenant_id"])
    op.create_index("ix_chat_messages_session_created", "chat_messages", ["session_id", "created_at"])

    op.create_table(
        "ai_insights",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("role", sa.String(64), nullable=True),
        sa.Column("category", sa.String(48), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("confidence", sa.Numeric(4, 3), nullable=True),
        sa.Column("evidence", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("actions", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("entity_type", sa.String(64), nullable=True),
        sa.Column("entity_id", _UUID, nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.create_index("ix_ai_insights_tenant_id", "ai_insights", ["tenant_id"])

    op.create_table(
        "eval_runs",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit(),
        sa.Column("status", sa.String(16), nullable=False, server_default="completed"),
        sa.Column("summary", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("results", postgresql.JSONB(), nullable=False, server_default="[]"),
    )
    op.create_index("ix_eval_runs_tenant_id", "eval_runs", ["tenant_id"])


def downgrade() -> None:
    op.drop_table("eval_runs")
    op.drop_table("ai_insights")
    op.drop_table("chat_messages")
    op.drop_table("chat_sessions")
