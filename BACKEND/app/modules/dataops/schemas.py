"""Import / export / reporting schemas (docs/05 S6)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.common.schemas import StrictModel


class ImportJobCreate(StrictModel):
    entity: str = Field(min_length=1, max_length=32)
    file_key: str = Field(min_length=1, max_length=512)


class ImportApply(StrictModel):
    mapping: dict | None = None


class ImportJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    entity: str
    status: str
    mapping: dict
    preview: dict
    total_rows: int
    ok_rows: int
    error_rows: int
    error_report_key: str | None = None


class ExportRequest(StrictModel):
    entity: str = Field(min_length=1, max_length=48)
    filters: dict = Field(default_factory=dict)
    columns: list[str] | None = None
    format: str = Field(default="csv", pattern=r"^(csv|xlsx)$")


class ReportRunRequest(StrictModel):
    params: dict | None = None


class ReportTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    tenant_id: uuid.UUID | None = None
    code: str
    name: str
    description: str | None = None
    query_def: dict
    layout: dict
    output: str
    is_active: bool


class ReportScheduleCreate(StrictModel):
    template_id: uuid.UUID
    cron_expr: str = Field(min_length=1, max_length=64)
    recipients: list[str] = Field(default_factory=list)
    locale: str = Field(default="en", max_length=16)
    is_active: bool = False


class ReportScheduleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    template_id: uuid.UUID
    cron_expr: str
    recipients: list
    locale: str
    is_active: bool
    last_run_at: datetime | None = None
