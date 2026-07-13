"""Knowledge-graph schemas (docs/02 §26)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class GraphQueryRequest(BaseModel):
    """Constrained pattern DSL — validated against the type whitelist (never raw Cypher)."""
    start_type: str
    start_key: str | None = None
    edge_types: list[str] = Field(default_factory=list)
    node_types: list[str] = Field(default_factory=list)
    depth: int = Field(default=2, ge=1, le=3)
