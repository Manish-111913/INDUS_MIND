"""Meter schemas (docs/05 S5)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.common.schemas import StrictModel


class MeterDefinitionCreate(StrictModel):
    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=255)
    unit_id: uuid.UUID | None = None
    unit: str | None = Field(default=None, max_length=32)
    reading_type: str = Field(default="gauge", pattern=r"^(gauge|counter)$")
    normal_min: float | None = None
    normal_max: float | None = None


class MeterDefinitionUpdate(StrictModel):
    name: str | None = Field(default=None, max_length=255)
    unit_id: uuid.UUID | None = None
    unit: str | None = Field(default=None, max_length=32)
    reading_type: str | None = Field(default=None, pattern=r"^(gauge|counter)$")
    normal_min: float | None = None
    normal_max: float | None = None


class MeterDefinitionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    code: str
    name: str
    unit_id: uuid.UUID | None = None
    unit: str | None = None
    reading_type: str
    normal_min: float | None = None
    normal_max: float | None = None


class ReadingCreate(StrictModel):
    meter_code: str | None = Field(default=None, max_length=64)
    meter_definition_id: uuid.UUID | None = None
    value: float
    recorded_at: datetime | None = None
    source: str = Field(default="manual", pattern=r"^(manual|import|api)$")
