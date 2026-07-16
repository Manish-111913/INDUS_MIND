"""Settings schemas (docs/05 S1)."""

from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.common.schemas import StrictModel

_SCOPE = r"^(tenant|plant|user)$"


class DefinitionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    key: str
    value_type: str
    enum_options: list[str] | None = None
    default_value: Any = None
    scope: str
    category: str
    label: str
    description: str | None = None
    is_public: bool


class SettingValueWrite(StrictModel):
    key: str = Field(min_length=1, max_length=128)
    scope: str = Field(pattern=_SCOPE)
    scope_id: uuid.UUID | None = None  # required for plant/user; defaults to tenant for tenant scope
    value: Any = None
