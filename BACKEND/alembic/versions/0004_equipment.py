"""equipment: plants, areas, equipment (self-referential hierarchy)

docs/02 §7, §23. Adds plants, areas, equipment with a self-FK hierarchy,
tenant-unique tag, JSONB specs, health_score, and pg_trgm GIN indexes on
tag/name for fuzzy resolve (P101 ≈ P-101 ≈ Pump-101).

Revision ID: 0004_equipment
Revises: 0003_users_rbac
Create Date: 2026-07-13
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004_equipment"
down_revision: str | None = "0003_users_rbac"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UUID = postgresql.UUID(as_uuid=True)


def _base_cols() -> list[sa.Column]:
    return [
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", _UUID, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
        sa.Column("created_by", _UUID, nullable=True),
        sa.Column("updated_by", _UUID, nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.BigInteger(), nullable=False, server_default="1"),
    ]


def upgrade() -> None:
    # ── plants ───────────────────────────────────────────────────────────────
    op.create_table(
        "plants",
        *_base_cols(),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("location", sa.String(255), nullable=True),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="Asia/Kolkata"),
        sa.UniqueConstraint("tenant_id", "code", name="uq_plants_tenant_code"),
    )
    op.create_index("ix_plants_tenant_id", "plants", ["tenant_id"])
    op.create_index("ix_plants_deleted_at", "plants", ["deleted_at"])

    # ── areas ────────────────────────────────────────────────────────────────
    op.create_table(
        "areas",
        *_base_cols(),
        sa.Column("plant_id", _UUID, sa.ForeignKey("plants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("code", sa.String(64), nullable=False),
        sa.UniqueConstraint("plant_id", "code", name="uq_areas_plant_code"),
    )
    op.create_index("ix_areas_tenant_id", "areas", ["tenant_id"])
    op.create_index("ix_areas_plant_id", "areas", ["plant_id"])
    op.create_index("ix_areas_deleted_at", "areas", ["deleted_at"])

    # ── equipment ────────────────────────────────────────────────────────────
    op.create_table(
        "equipment",
        *_base_cols(),
        sa.Column("plant_id", _UUID, sa.ForeignKey("plants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("area_id", _UUID, sa.ForeignKey("areas.id", ondelete="SET NULL"), nullable=True),
        sa.Column("parent_id", _UUID, sa.ForeignKey("equipment.id", ondelete="SET NULL"),
                  nullable=True),
        sa.Column("tag", sa.String(128), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("type_id", _UUID, nullable=True),
        sa.Column("criticality", sa.String(8), nullable=False, server_default="C"),
        sa.Column("status", sa.String(32), nullable=False, server_default="operational"),
        sa.Column("manufacturer", sa.String(255), nullable=True),
        sa.Column("model", sa.String(255), nullable=True),
        sa.Column("serial_no", sa.String(255), nullable=True),
        sa.Column("install_date", sa.Date(), nullable=True),
        sa.Column("specs", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("health_score", sa.Numeric(5, 2), nullable=True),
        sa.Column("health_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "tag", name="uq_equipment_tenant_tag"),
    )
    op.create_index("ix_equipment_tenant_id", "equipment", ["tenant_id"])
    op.create_index("ix_equipment_tenant_tag", "equipment", ["tenant_id", "tag"])
    op.create_index("ix_equipment_area_id", "equipment", ["area_id"])
    op.create_index("ix_equipment_parent_id", "equipment", ["parent_id"])
    op.create_index("ix_equipment_plant_id", "equipment", ["plant_id"])
    op.create_index("ix_equipment_deleted_at", "equipment", ["deleted_at"])
    # pg_trgm indexes for fuzzy resolve (docs/02 §23, §50)
    op.execute("CREATE INDEX ix_equipment_tag_trgm ON equipment USING gin (tag gin_trgm_ops)")
    op.execute("CREATE INDEX ix_equipment_name_trgm ON equipment USING gin (name gin_trgm_ops)")


def downgrade() -> None:
    op.drop_table("equipment")
    op.drop_table("areas")
    op.drop_table("plants")
