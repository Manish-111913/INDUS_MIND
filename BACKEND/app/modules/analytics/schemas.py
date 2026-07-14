"""Analytics schemas (docs/02 §13, §22)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    key: str
    name: str
    description: str | None = None
    category: str | None = None
    params_schema: list
    chart_config: dict
    required_permission: str | None = None


class ReportRun(BaseModel):
    params: dict = Field(default_factory=dict)


class ReportExport(BaseModel):
    format: str = Field(default="xlsx", pattern=r"^(xlsx|pdf|csv)$")
    params: dict = Field(default_factory=dict)


class ReportSchedule(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    cron: str = Field(min_length=1, max_length=64)
    recipients: list[str] = Field(default_factory=list)
    params: dict = Field(default_factory=dict)
    format: str = Field(default="xlsx", pattern=r"^(xlsx|pdf|csv)$")


class ScheduledReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    report_id: uuid.UUID
    cron: str
    recipients: list
    params: dict
    format: str
    active: bool
    last_run_at: datetime | None = None
