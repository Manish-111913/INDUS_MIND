"""Preferences schemas (docs/05 S2)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.common.schemas import StrictModel
from app.modules.preferences.models import VIEW_ENTITIES


class PreferenceWrite(StrictModel):
    value: Any


class PreferenceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    key: str
    value: Any


class SavedViewCreate(StrictModel):
    entity: str = Field(min_length=1, max_length=48)
    name: str = Field(min_length=1, max_length=255)
    filters: dict = Field(default_factory=dict)
    columns: list = Field(default_factory=list)
    sort: dict = Field(default_factory=dict)
    is_shared: bool = False
    is_default: bool = False

    @field_validator("entity")
    @classmethod
    def _entity_known(cls, v: str) -> str:
        if v not in VIEW_ENTITIES:
            raise ValueError(f"entity must be one of {sorted(VIEW_ENTITIES)}")
        return v


class SavedViewUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    filters: dict | None = None
    columns: list | None = None
    sort: dict | None = None
    is_shared: bool | None = None
    is_default: bool | None = None


class SavedViewRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    user_id: uuid.UUID
    entity: str
    name: str
    filters: dict
    columns: list
    sort: dict
    is_shared: bool
    is_default: bool
    created_at: datetime
