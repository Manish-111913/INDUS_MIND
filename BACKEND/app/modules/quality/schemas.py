"""Quality schemas (docs/02 §13, §21)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class NCRCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    area_id: uuid.UUID | None = None
    line: str | None = Field(default=None, max_length=64)
    defect_type_id: uuid.UUID | None = None
    severity: str = Field(default="minor", max_length=16)
    description: str | None = None
    equipment_id: uuid.UUID | None = None
    capa: dict = Field(default_factory=dict)
    detected_at: datetime | None = None


class NCRUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    area_id: uuid.UUID | None = None
    line: str | None = Field(default=None, max_length=64)
    defect_type_id: uuid.UUID | None = None
    severity: str | None = Field(default=None, max_length=16)
    description: str | None = None
    equipment_id: uuid.UUID | None = None
    status: str | None = Field(default=None, pattern=r"^(open|in_review|closed|void)$")
    capa: dict | None = None
    version: int | None = None


class NCRRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    ncr_number: str
    area_id: uuid.UUID | None = None
    line: str | None = None
    defect_type_id: uuid.UUID | None = None
    severity: str
    description: str | None = None
    equipment_id: uuid.UUID | None = None
    status: str
    capa: dict
    detected_at: datetime
    closed_at: datetime | None = None
    version: int
