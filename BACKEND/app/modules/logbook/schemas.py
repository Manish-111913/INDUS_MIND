"""Shift-logbook schemas (docs/08 S13)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class ShiftLogCreate(BaseModel):
    plant_id: uuid.UUID
    shift: str = Field(min_length=1, max_length=32)
    log_date: date
    content: str = Field(min_length=1)
    tags: list[str] = Field(default_factory=list)


class ShiftLogUpdate(BaseModel):
    content: str | None = Field(default=None, min_length=1)
    tags: list[str] | None = None
    shift: str | None = Field(default=None, max_length=32)


class ShiftLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    plant_id: uuid.UUID
    shift: str
    log_date: date
    author_id: uuid.UUID | None
    content: str
    tags: list[str]
    status: str
    submitted_at: datetime | None
    ai_summary: str | None
    document_id: uuid.UUID | None
    created_at: datetime
    # Resolved display names (attached by the service) so the UI can show the
    # operator and plant without a second round-trip. Null if the row is gone.
    author_name: str | None = None
    plant_name: str | None = None
