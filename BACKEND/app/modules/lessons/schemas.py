"""Lessons schemas (docs/02 §13)."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class LessonRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    title: str
    narrative: str | None = None
    pattern_summary: str | None = None
    evidence: list
    affected_equipment_ids: list[uuid.UUID]
    recommended_action: str | None = None
    confidence: Decimal | None = None
    status: str
    source: str
    published_at: datetime | None = None
    created_at: datetime
    version: int


class LessonUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    title: str | None = Field(default=None, min_length=1, max_length=512)
    narrative: str | None = None
    pattern_summary: str | None = None
    recommended_action: str | None = None
    status: str | None = Field(default=None, pattern=r"^(candidate|published|archived)$")
    version: int | None = None


class LessonDetect(BaseModel):
    scope: dict = Field(default_factory=dict)
