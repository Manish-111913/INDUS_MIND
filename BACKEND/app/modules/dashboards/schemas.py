"""Dashboard schemas (docs/02 §13, §21)."""

from __future__ import annotations

from pydantic import Field

from app.common.schemas import StrictModel


class LayoutItem(StrictModel):
    widget_key: str
    grid: dict = Field(default_factory=dict)  # {x,y,w,h}
    params: dict = Field(default_factory=dict)


class ConfigSave(StrictModel):
    layout: list[LayoutItem] = Field(default_factory=list)
