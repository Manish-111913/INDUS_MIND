"""Tenant Pydantic schemas (docs/02 §13, §41)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.common.schemas import StrictModel


class TenantCreate(StrictModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=120, pattern=r"^[a-z0-9-]+$")
    plan: str = "free"


class TenantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    slug: str
    status: str
    plan: str
    settings: dict
    created_at: datetime
