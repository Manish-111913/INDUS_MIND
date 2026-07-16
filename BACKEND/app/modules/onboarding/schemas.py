"""Onboarding schemas (docs/05 S10)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TourStepRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_no: int
    selector: str | None
    title: str
    body: str
    placement: str | None


class TourStepWrite(BaseModel):
    order_no: int = Field(ge=0)
    selector: str | None = Field(default=None, max_length=256)
    title: str = Field(min_length=1, max_length=256)
    body: str = Field(min_length=1)
    placement: str | None = Field(default=None, max_length=16)


class TourRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name: str
    description: str | None
    role_scope: str | None
    is_active: bool
    steps: list[TourStepRead] = Field(default_factory=list)


class TourWrite(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)
    description: str | None = None
    role_scope: str | None = Field(default=None, max_length=64)
    is_active: bool = True
    # Steps are written with the tour: a tour is only meaningful as an ordered
    # whole, and editing them piecemeal would let order_no collide mid-edit.
    steps: list[TourStepWrite] = Field(default_factory=list)


class ChangelogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    version: str
    title: str
    body_md: str
    released_at: datetime
    is_published: bool


class ChangelogWrite(BaseModel):
    version: str = Field(min_length=1, max_length=32)
    title: str = Field(min_length=1, max_length=256)
    body_md: str = Field(min_length=1)
    released_at: datetime | None = None
    is_published: bool = True


class SeedDemoAccepted(BaseModel):
    job_id: str
    status: str
    detail: str
