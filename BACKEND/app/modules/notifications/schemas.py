"""Notification schemas (docs/02 §13, §20)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.common.schemas import StrictModel


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    category: str
    priority: str
    title: str
    body: str | None = None
    entity_type: str | None = None
    entity_id: uuid.UUID | None = None
    read_at: datetime | None = None
    channels_sent: list
    created_at: datetime


class MarkReadRequest(StrictModel):
    ids: list[uuid.UUID] | None = None
    all: bool = False

    @model_validator(mode="after")
    def _one_of(self):
        if not self.all and not self.ids:
            raise ValueError("Provide `ids` or set `all` to true")
        return self


class PreferenceUpdate(StrictModel):
    category: str = Field(max_length=48)
    channel: str = Field(pattern=r"^(in_app|email|push)$")
    enabled: bool


class PreferencesUpdate(StrictModel):
    preferences: list[PreferenceUpdate] = Field(min_length=1)


class BroadcastRequest(StrictModel):
    category: str = Field(default="system", max_length=48)
    priority: str = Field(default="normal", max_length=16)
    title: str = Field(min_length=1, max_length=512)
    body: str | None = None
    audience: list[str] | None = None  # defaults to all active users (subscribers)


# ── event-preference matrix (docs/05 S3) ──────────────────────────────────────
class EventPreferenceUpdate(StrictModel):
    event_code: str = Field(min_length=1, max_length=64)
    in_app: bool = True
    email: bool = False
    digest: str = Field(default="instant", pattern=r"^(instant|daily|off)$")


class EventPreferencesUpdate(StrictModel):
    preferences: list[EventPreferenceUpdate] = Field(min_length=1)


# ── notification templates (docs/05 S3) ───────────────────────────────────────
class TemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    tenant_id: uuid.UUID | None = None
    event_code: str
    channel: str
    locale: str
    subject_tpl: str | None = None
    body_tpl: str
    sample_payload: dict
    is_active: bool
    version: int


class TemplateCreate(StrictModel):
    event_code: str = Field(min_length=1, max_length=64)
    channel: str = Field(pattern=r"^(in_app|email|webhook)$")
    locale: str = Field(default="en", max_length=16)
    subject_tpl: str | None = None
    body_tpl: str = Field(min_length=1)
    sample_payload: dict = Field(default_factory=dict)
    is_active: bool = True


class TemplateUpdate(StrictModel):
    subject_tpl: str | None = None
    body_tpl: str | None = None
    locale: str | None = Field(default=None, max_length=16)
    sample_payload: dict | None = None
    is_active: bool | None = None


class TemplatePreviewRequest(StrictModel):
    template_id: uuid.UUID | None = None
    subject_tpl: str | None = None
    body_tpl: str | None = None
    sample_payload: dict | None = None
