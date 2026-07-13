"""initial baseline — enable required Postgres extensions

Empty of tables by design (models land per module). It enables the extensions
the whole schema is built on so later migrations can assume them:
  · pgcrypto  → gen_random_uuid() for UUID pks (docs/02 §7)
  · vector    → document_chunks.embedding VECTOR(1024) (docs/02 §7, §10)
  · pg_trgm   → fuzzy tag/text search (docs/02 §5)

Revision ID: 0001_initial
Revises:
Create Date: 2026-07-13
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")


def downgrade() -> None:
    # Extensions are foundational; dropping them would cascade schema-wide.
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
    op.execute("DROP EXTENSION IF EXISTS vector")
    op.execute("DROP EXTENSION IF EXISTS pgcrypto")
