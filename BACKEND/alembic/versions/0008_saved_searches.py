"""saved_searches (docs/02 §7, §27)

Revision ID: 0008_saved_searches
Revises: 0007_extraction_ai
Create Date: 2026-07-13
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008_saved_searches"
down_revision: str | None = "0007_extraction_ai"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "saved_searches",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
        sa.Column("created_by", _UUID, nullable=True),
        sa.Column("updated_by", _UUID, nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_id", _UUID, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column("filters", postgresql.JSONB(), nullable=False, server_default="{}"),
    )
    op.create_index("ix_saved_searches_tenant_id", "saved_searches", ["tenant_id"])
    op.create_index("ix_saved_searches_user_id", "saved_searches", ["user_id"])


def downgrade() -> None:
    op.drop_table("saved_searches")
