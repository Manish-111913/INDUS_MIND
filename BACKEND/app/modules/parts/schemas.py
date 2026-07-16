"""Spare-parts schemas (docs/08 S12)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class PartCreate(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=256)
    description: str | None = None
    unit: str | None = Field(default=None, max_length=32)
    min_stock: float = Field(default=0, ge=0)
    on_hand: float = Field(default=0, ge=0)
    location: str | None = Field(default=None, max_length=128)
    is_active: bool = True


class PartUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=256)
    description: str | None = None
    unit: str | None = Field(default=None, max_length=32)
    min_stock: float | None = Field(default=None, ge=0)
    location: str | None = Field(default=None, max_length=128)
    is_active: bool | None = None
    # on_hand is intentionally NOT patchable here — stock changes only through
    # /adjust so a movement is always written alongside.


class PartRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name: str
    description: str | None
    unit: str | None
    min_stock: float
    on_hand: float
    location: str | None
    is_active: bool
    is_low_stock: bool = False


class StockAdjust(BaseModel):
    """Manual stock correction or receipt — always writes a movement."""

    delta: float = Field(description="Signed change; negative removes stock.")
    reason: Literal["adjustment", "receipt"] = "adjustment"


class WorkOrderPartWrite(BaseModel):
    part_id: uuid.UUID
    qty_planned: float = Field(gt=0)


class WorkOrderPartUpdate(BaseModel):
    qty_planned: float | None = Field(default=None, gt=0)
    qty_used: float | None = Field(default=None, ge=0)


class WorkOrderPartRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    work_order_id: uuid.UUID
    part_id: uuid.UUID
    qty_planned: float
    qty_used: float | None


class PartMovementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    part_id: uuid.UUID
    delta: float
    reason: str
    ref_id: uuid.UUID | None
    created_at: datetime
