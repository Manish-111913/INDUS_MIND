"""Knowledge-graph schemas (docs/02 §26)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel as _BaseModel
from pydantic import ConfigDict, Field

from app.common.schemas import StrictModel


class GraphQueryRequest(StrictModel):
    """Constrained pattern DSL — validated against the type whitelist (never raw Cypher)."""
    start_type: str
    start_key: str | None = None
    edge_types: list[str] = Field(default_factory=list)
    node_types: list[str] = Field(default_factory=list)
    depth: int = Field(default=2, ge=1, le=3)


class SavedSearchCreate(StrictModel):
    name: str = Field(min_length=1, max_length=255)
    query: str = Field(min_length=1)
    filters: dict = Field(default_factory=dict)


class SavedSearchRead(_BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    query: str
    filters: dict
    created_at: datetime
