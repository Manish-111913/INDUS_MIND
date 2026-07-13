"""Lookup schemas (docs/02 §13, §27)."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field


class LookupRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    category: str
    code: str
    label: str
    sort: int
    meta: dict
    active: bool


class LookupCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    category: str = Field(min_length=1, max_length=64)
    code: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=255)
    sort: int = 0
    meta: dict = Field(default_factory=dict)
    active: bool = True


class LookupUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    label: str | None = Field(default=None, min_length=1, max_length=255)
    sort: int | None = None
    meta: dict | None = None
    active: bool | None = None
    version: int | None = None
