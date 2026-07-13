"""extraction + AI config: extracted_entities, ai_model_configs, prompt_templates, llm_usage

docs/02 §7, §37, §38. Human-in-the-loop entities, DB-configured model choice
(one active config per tenant×capability), versioned prompts, and token metering.

Revision ID: 0007_extraction_ai
Revises: 0006_chunks
Create Date: 2026-07-13
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007_extraction_ai"
down_revision: str | None = "0006_chunks"
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
    # ── extracted_entities ───────────────────────────────────────────────────
    op.create_table(
        "extracted_entities",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        *_audit(),
        sa.Column("version", sa.BigInteger(), nullable=False, server_default="1"),
        sa.Column("document_id", _UUID, sa.ForeignKey("documents.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("chunk_id", _UUID, nullable=True),
        sa.Column("entity_type", sa.String(32), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("normalized_value", sa.String(512), nullable=True),
        sa.Column("confidence", sa.Numeric(4, 3), nullable=True),
        sa.Column("page_no", sa.Integer(), nullable=True),
        sa.Column("bbox", postgresql.JSONB(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="auto"),
        sa.Column("linked_record_type", sa.String(64), nullable=True),
        sa.Column("linked_record_id", _UUID, nullable=True),
    )
    op.create_index("ix_extracted_entities_tenant_id", "extracted_entities", ["tenant_id"])
    op.create_index("ix_extracted_entities_document_id", "extracted_entities", ["document_id"])
    op.create_index("ix_extracted_entities_type_norm", "extracted_entities",
                    ["entity_type", "normalized_value"])

    # ── ai_model_configs ─────────────────────────────────────────────────────
    op.create_table(
        "ai_model_configs",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=True),
        *_audit(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.BigInteger(), nullable=False, server_default="1"),
        sa.Column("capability", sa.String(32), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("model_name", sa.String(128), nullable=False),
        sa.Column("params", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("confidence_threshold", sa.Numeric(4, 3), nullable=False, server_default="0.700"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("fallback_config_id", _UUID, nullable=True),
    )
    op.create_index("ix_ai_model_configs_tenant_id", "ai_model_configs", ["tenant_id"])
    # one active config per tenant×capability (global tenant_id NULL folded to zero-uuid)
    op.execute(
        "CREATE UNIQUE INDEX uq_ai_config_active ON ai_model_configs "
        "(COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), capability) "
        "WHERE active AND deleted_at IS NULL"
    )

    # ── prompt_templates ─────────────────────────────────────────────────────
    op.create_table(
        "prompt_templates",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=True),
        *_audit(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("key", sa.String(64), nullable=False),
        sa.Column("capability", sa.String(32), nullable=False),
        sa.Column("template", sa.Text(), nullable=False),
        sa.Column("variables", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.UniqueConstraint("tenant_id", "key", "version", name="uq_prompt_templates_tenant_key_version"),
    )
    op.create_index("ix_prompt_templates_tenant_id", "prompt_templates", ["tenant_id"])

    # ── llm_usage ────────────────────────────────────────────────────────────
    op.create_table(
        "llm_usage",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=True),
        *_audit(),
        sa.Column("capability", sa.String(32), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("model_name", sa.String(128), nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completion_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_tokens", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("latency_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("logged_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
    )
    op.create_index("ix_llm_usage_tenant_id", "llm_usage", ["tenant_id"])


def downgrade() -> None:
    op.drop_table("llm_usage")
    op.drop_table("prompt_templates")
    op.execute("DROP INDEX IF EXISTS uq_ai_config_active")
    op.drop_table("ai_model_configs")
    op.drop_table("extracted_entities")
