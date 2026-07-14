"""Dashboard schemas (docs/02 §13, §21)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class LayoutItem(BaseModel):
    widget_key: str
    grid: dict = Field(default_factory=dict)  # {x,y,w,h}
    params: dict = Field(default_factory=dict)


class ConfigSave(BaseModel):
    layout: list[LayoutItem] = Field(default_factory=list)
