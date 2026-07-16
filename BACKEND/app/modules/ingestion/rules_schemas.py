"""Extraction-rule admin schemas (docs/05 S7)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Method = Literal["regex", "keyword", "llm"]


class _RuleBase(BaseModel):
    entity_type: str = Field(min_length=1, max_length=32)
    method: Method
    pattern: str | None = Field(default=None, max_length=4000)
    llm_hint: str | None = Field(default=None, max_length=4000)
    priority: int = Field(default=100, ge=0, le=10_000)
    confidence: float = Field(default=0.7, ge=0.0, le=1.0)
    is_active: bool = True
    description: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def _method_needs_its_field(self):
        """regex/keyword are useless without a pattern; llm without a hint. Catch
        it here rather than letting the rule sit active and silently match nothing."""
        if self.method in ("regex", "keyword") and not (self.pattern or "").strip():
            raise ValueError(f"method '{self.method}' requires a pattern")
        if self.method == "llm" and not (self.llm_hint or "").strip():
            raise ValueError("method 'llm' requires an llm_hint")
        return self


class RuleCreate(_RuleBase):
    pass


class RuleUpdate(BaseModel):
    """PATCH — every field optional. Validated against the merged row in the
    service, since a partial body can't check the method/pattern pairing alone."""

    entity_type: str | None = Field(default=None, min_length=1, max_length=32)
    method: Method | None = None
    pattern: str | None = Field(default=None, max_length=4000)
    llm_hint: str | None = Field(default=None, max_length=4000)
    priority: int | None = Field(default=None, ge=0, le=10_000)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    is_active: bool | None = None
    description: str | None = Field(default=None, max_length=2000)


class RuleRead(_RuleBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    version: int
    created_at: datetime
    updated_at: datetime


class RuleTestRequest(BaseModel):
    """Test an unsaved rule against sample text — the editor's live preview."""

    method: Method
    pattern: str = Field(min_length=1, max_length=4000)
    sample_text: str = Field(min_length=1)
    entity_type: str = Field(default="test", max_length=32)
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)


class MatchSpan(BaseModel):
    value: str
    start: int | None = None
    end: int | None = None
    confidence: float


class RuleTestResponse(BaseModel):
    match_count: int
    matches: list[MatchSpan]
