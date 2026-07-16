"""Importable-entity registry (docs/05 S6).

One entry per importable entity. Adding a new importable entity is a single
registry entry — no new endpoints, no new parsing code; the generic import
service drives all of them.

Each entry is a three-step pipeline, which is what lets a spreadsheet stay
human-writable *and* keeps the entity's real validation rules the single source
of truth:

  1. ``row_schema``    — the CSV shape. Operators type ``plant_code=JAM``, not a
     UUID, so the sheet is fillable by a human. It also drives the header order,
     the required set, and the mapping guess (all derived from ``model_fields``,
     so a new field on the schema shows up in ``/import/templates/{entity}``
     automatically — nothing to hand-maintain).
  2. ``resolve``       — turns those human codes into real foreign keys
     (``plant_code`` → ``plant_id``), raising ``ValueError`` for anything it
     can't resolve so the row lands in the error report with a readable reason.
  3. ``entity_schema`` — the module's **existing** create-schema
     (``EquipmentCreate``, ``ReadingCreate``, ``UserInvite``). Every imported row
     is validated through exactly the same rules an API caller gets, so the two
     paths can't drift.

``resolve`` returns ``(payload, extras)``: ``payload`` is validated by
``entity_schema``; ``extras`` carries anything the upsert needs that isn't part
of the create-schema (e.g. the resolved equipment row for a reading).
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


# ── per-row (CSV-shaped) schemas ──────────────────────────────────────────────
class _Row(BaseModel):
    # extra="ignore": the sheet may carry columns we don't map; the service only
    # projects mapped fields anyway.
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)


class EquipmentRow(_Row):
    tag: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=255)
    plant_code: str = Field(min_length=1, max_length=64)
    area_code: str | None = None
    type_code: str | None = None
    criticality: str = "C"
    status: str = "operational"
    manufacturer: str | None = None
    model: str | None = None

    @field_validator("criticality")
    @classmethod
    def _crit(cls, v: str) -> str:
        v = (v or "C").upper()
        return v if v in ("A", "B", "C") else "C"


class ReadingRow(_Row):
    equipment_tag: str = Field(min_length=1, max_length=128)
    meter_code: str = Field(min_length=1, max_length=64)
    value: float
    recorded_at: datetime | None = None

    @field_validator("recorded_at", mode="before")
    @classmethod
    def _dt(cls, v):
        if v in (None, ""):
            return None
        try:
            dt = datetime.fromisoformat(str(v).strip().replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
        except (ValueError, TypeError) as exc:
            raise ValueError(f"invalid recorded_at '{v}'") from exc


class UserRow(_Row):
    email: str = Field(min_length=3, max_length=320)
    full_name: str = Field(min_length=1, max_length=255)
    role: str | None = None


# ── resolvers: human codes → real foreign keys ────────────────────────────────
class PartRow(_Row):
    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=256)
    unit: str | None = None
    min_stock: float = 0
    on_hand: float = 0
    location: str | None = None


async def _resolve_part(session: AsyncSession, tenant_id, row: PartRow):
    # Parts have no code→FK lookups to resolve; the row maps straight to the
    # create payload. (Row + create schema still stay distinct so a future
    # importable field, e.g. supplier_code, has a resolve seam.)
    return {"code": row.code, "name": row.name, "unit": row.unit,
            "min_stock": row.min_stock, "on_hand": row.on_hand, "location": row.location}, {}


async def _upsert_part(session: AsyncSession, tenant_id, data, extras, actor) -> None:
    from app.modules.parts.models import Part, PartMovement

    part = (await session.execute(select(Part).where(
        Part.tenant_id == tenant_id, Part.code == data["code"]))).scalar_one_or_none()
    if part is None:
        part = Part(tenant_id=tenant_id, code=data["code"], name=data["name"],
                    unit=data["unit"], min_stock=data["min_stock"], on_hand=data["on_hand"],
                    location=data["location"], created_by=actor.id, updated_by=actor.id)
        session.add(part)
        await session.flush()
        if Decimal(str(data["on_hand"])) != 0:
            session.add(PartMovement(tenant_id=tenant_id, part_id=part.id,
                                     delta=data["on_hand"], reason="receipt",
                                     created_by=actor.id, updated_by=actor.id))
    else:
        # Import updates metadata but not on_hand — stock only moves through a
        # movement (adjust/consume), never a silent overwrite.
        part.name, part.unit = data["name"], data["unit"]
        part.min_stock, part.location = data["min_stock"], data["location"]
        part.updated_by = actor.id


async def _resolve_equipment(session: AsyncSession, tenant_id, row: EquipmentRow):
    from app.modules.equipment.models import Area, Plant
    from app.modules.lookups.models import Lookup

    plant = (await session.execute(select(Plant).where(
        Plant.tenant_id == tenant_id, Plant.code == row.plant_code,
        Plant.deleted_at.is_(None)))).scalar_one_or_none()
    if plant is None:
        raise ValueError(f"unknown plant_code '{row.plant_code}'")

    area_id = None
    if row.area_code:
        area = (await session.execute(select(Area).where(
            Area.tenant_id == tenant_id, Area.plant_id == plant.id,
            Area.code == row.area_code, Area.deleted_at.is_(None)))).scalar_one_or_none()
        if area is None:
            raise ValueError(f"unknown area_code '{row.area_code}' for plant '{row.plant_code}'")
        area_id = area.id

    type_id = None
    if row.type_code:
        lk = (await session.execute(select(Lookup).where(
            Lookup.tenant_id.is_(None), Lookup.category == "equipment_types",
            Lookup.code == row.type_code))).scalar_one_or_none()
        if lk is None:
            raise ValueError(f"unknown type_code '{row.type_code}'")
        type_id = lk.id

    payload = {
        "plant_id": plant.id, "area_id": area_id, "type_id": type_id,
        "tag": row.tag, "name": row.name, "criticality": row.criticality,
        "status": row.status, "manufacturer": row.manufacturer, "model": row.model,
    }
    return payload, {}


async def _resolve_reading(session: AsyncSession, tenant_id, row: ReadingRow):
    from app.modules.equipment.models import Equipment

    eq = (await session.execute(select(Equipment).where(
        Equipment.tenant_id == tenant_id, Equipment.tag == row.equipment_tag,
        Equipment.deleted_at.is_(None)))).scalar_one_or_none()
    if eq is None:
        raise ValueError(f"unknown equipment_tag '{row.equipment_tag}'")

    payload = {"meter_code": row.meter_code, "value": row.value,
               "recorded_at": row.recorded_at, "source": "import"}
    return payload, {"equipment_id": eq.id}


async def _resolve_user(session: AsyncSession, tenant_id, row: UserRow):
    from app.modules.users.models import Role

    role_ids: list[uuid.UUID] = []
    if row.role:
        role = (await session.execute(select(Role).where(
            Role.tenant_id == tenant_id, Role.name == row.role,
            Role.deleted_at.is_(None)))).scalar_one_or_none()
        if role is None:
            raise ValueError(f"unknown role '{row.role}'")
        role_ids = [role.id]

    payload = {"email": row.email, "full_name": row.full_name, "role_ids": role_ids}
    return payload, {}


# ── upserts (idempotent; receive the entity-schema-validated payload) ─────────
async def _upsert_equipment(session: AsyncSession, tenant_id, data, extras, actor) -> None:
    from app.modules.equipment.models import Equipment

    eq = (await session.execute(select(Equipment).where(
        Equipment.tenant_id == tenant_id, Equipment.tag == data.tag))).scalar_one_or_none()
    if eq is None:
        session.add(Equipment(
            tenant_id=tenant_id, plant_id=data.plant_id, area_id=data.area_id,
            tag=data.tag, name=data.name, type_id=data.type_id,
            criticality=data.criticality, status=data.status,
            manufacturer=data.manufacturer, model=data.model,
            created_by=actor.id, updated_by=actor.id))
    else:
        eq.plant_id = data.plant_id
        eq.name, eq.criticality, eq.status = data.name, data.criticality, data.status
        eq.manufacturer, eq.model = data.manufacturer, data.model
        if data.area_id:
            eq.area_id = data.area_id
        if data.type_id:
            eq.type_id = data.type_id
        eq.updated_by = actor.id


async def _upsert_reading(session: AsyncSession, tenant_id, data, extras, actor) -> None:
    from app.modules.meters.models import MeterReading
    from app.modules.meters.repository import EquipmentMeterRepository, MeterDefinitionRepository

    definition = await MeterDefinitionRepository(session, tenant_id).by_code(data.meter_code)
    if definition is None:
        raise ValueError(f"unknown meter_code '{data.meter_code}'")
    link = await EquipmentMeterRepository(session, tenant_id).get_or_create(
        extras["equipment_id"], definition.id)
    session.add(MeterReading(
        tenant_id=tenant_id, equipment_meter_id=link.id, value=Decimal(str(data.value)),
        recorded_at=data.recorded_at or datetime.now(UTC), source=data.source,
        recorded_by=actor.id, created_by=actor.id, updated_by=actor.id))


async def _upsert_user(session: AsyncSession, tenant_id, data, extras, actor) -> None:
    from app.modules.auth.models import User
    from app.modules.users.models import UserRole

    user = (await session.execute(select(User).where(
        User.tenant_id == tenant_id, User.email == data.email))).scalar_one_or_none()
    if user is None:
        user = User(tenant_id=tenant_id, email=data.email, full_name=data.full_name,
                    password_hash=None, status="invited",
                    created_by=actor.id, updated_by=actor.id)
        session.add(user)
        await session.flush()  # need user.id to attach roles
    else:
        user.full_name = data.full_name
        user.updated_by = actor.id
    for role_id in data.role_ids:
        exists = (await session.execute(select(UserRole).where(
            UserRole.user_id == user.id, UserRole.role_id == role_id))).scalar_one_or_none()
        if exists is None:
            session.add(UserRole(user_id=user.id, role_id=role_id))


# ── registry ──────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class ImportEntitySpec:
    row_schema: type[_Row]          # CSV shape — drives template headers + mapping guess
    entity_schema: type[BaseModel]  # the module's real create-schema — the rules of record
    resolve: Callable[..., Any]     # async (session, tenant_id, row) -> (payload, extras)
    upsert: Callable[..., Any]      # async (session, tenant_id, validated, extras, actor)

    @property
    def fields(self) -> list[str]:
        """Header order for the CSV template + mapping guess — from the schema."""
        return list(self.row_schema.model_fields.keys())

    @property
    def required(self) -> list[str]:
        return [name for name, f in self.row_schema.model_fields.items() if f.is_required()]


def _registry() -> dict[str, ImportEntitySpec]:
    from app.modules.equipment.schemas import EquipmentCreate
    from app.modules.meters.schemas import ReadingCreate
    from app.modules.parts.schemas import PartCreate
    from app.modules.users.schemas import UserInvite

    return {
        "equipment": ImportEntitySpec(
            row_schema=EquipmentRow, entity_schema=EquipmentCreate,
            resolve=_resolve_equipment, upsert=_upsert_equipment),
        "readings": ImportEntitySpec(
            row_schema=ReadingRow, entity_schema=ReadingCreate,
            resolve=_resolve_reading, upsert=_upsert_reading),
        "users": ImportEntitySpec(
            row_schema=UserRow, entity_schema=UserInvite,
            resolve=_resolve_user, upsert=_upsert_user),
        "parts": ImportEntitySpec(
            row_schema=PartRow, entity_schema=PartCreate,
            resolve=_resolve_part, upsert=_upsert_part),
    }


REGISTRY: dict[str, ImportEntitySpec] = _registry()

#: The importable entities — derived from the registry so the two can't drift.
IMPORT_ENTITIES: tuple[str, ...] = tuple(REGISTRY)


def get_spec(entity: str) -> ImportEntitySpec:
    spec = REGISTRY.get(entity)
    if spec is None:
        from app.core.exceptions import ValidationFailed

        raise ValidationFailed(
            f"Unknown import entity '{entity}' (known: {', '.join(IMPORT_ENTITIES)})",
            code="IMPORT_ENTITY_UNKNOWN", http_status=422)
    return spec
