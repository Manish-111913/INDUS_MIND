"""Equipment / plant / area schemas (docs/02 §13, §23, §41)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.common.schemas import StrictModel


# ── plants ───────────────────────────────────────────────────────────────────
class PlantCreate(StrictModel):
    name: str = Field(min_length=1, max_length=255)
    code: str = Field(min_length=1, max_length=64)
    location: str | None = Field(default=None, max_length=255)
    timezone: str = "Asia/Kolkata"


class PlantUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    location: str | None = None
    timezone: str | None = None
    version: int | None = None


class PlantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    code: str
    location: str | None = None
    timezone: str
    version: int


# ── areas ────────────────────────────────────────────────────────────────────
class AreaCreate(StrictModel):
    plant_id: uuid.UUID
    name: str = Field(min_length=1, max_length=255)
    code: str = Field(min_length=1, max_length=64)


class AreaUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    version: int | None = None


class AreaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    plant_id: uuid.UUID
    name: str
    code: str
    version: int


# ── equipment ────────────────────────────────────────────────────────────────
class EquipmentCreate(StrictModel):
    plant_id: uuid.UUID
    area_id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None
    tag: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=255)
    type_id: uuid.UUID | None = None
    criticality: str = Field(default="C", max_length=8)
    status: str = Field(default="operational", max_length=32)
    manufacturer: str | None = Field(default=None, max_length=255)
    model: str | None = Field(default=None, max_length=255)
    serial_no: str | None = Field(default=None, max_length=255)
    install_date: date | None = None
    specs: dict = Field(default_factory=dict)
    health_score: Decimal | None = Field(default=None, ge=0, le=100)


class EquipmentUpdate(StrictModel):
    area_id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    type_id: uuid.UUID | None = None
    criticality: str | None = Field(default=None, max_length=8)
    status: str | None = Field(default=None, max_length=32)
    manufacturer: str | None = None
    model: str | None = None
    serial_no: str | None = None
    install_date: date | None = None
    specs: dict | None = None
    health_score: Decimal | None = Field(default=None, ge=0, le=100)
    version: int | None = None


class EquipmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    plant_id: uuid.UUID
    area_id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None
    tag: str
    name: str
    type_id: uuid.UUID | None = None
    criticality: str
    status: str
    manufacturer: str | None = None
    model: str | None = None
    serial_no: str | None = None
    install_date: date | None = None
    specs: dict
    health_score: Decimal | None = None
    health_updated_at: datetime | None = None
    version: int


# ── 360° derived views ───────────────────────────────────────────────────────
class TimelineEvent(BaseModel):
    source: str            # audit | work_order | failure | document | ...
    type: str              # equipment.created | work_order.closed | ...
    title: str
    timestamp: datetime
    actor_id: uuid.UUID | None = None
    ref_type: str | None = None
    ref_id: str | None = None
    payload: dict = Field(default_factory=dict)


class ResolveMatch(BaseModel):
    id: uuid.UUID
    tag: str
    name: str
    score: float


class ImportRowResult(BaseModel):
    row: int
    status: str            # created | error
    id: uuid.UUID | None = None
    tag: str | None = None
    errors: list[str] = Field(default_factory=list)


class ImportReport(BaseModel):
    total: int
    created: int
    failed: int
    rows: list[ImportRowResult]
