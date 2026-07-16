"""Integration-layer schemas (docs/05 S8)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ── api keys ─────────────────────────────────────────────────────────────────
class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    scopes: list[str] = Field(default_factory=list)
    expires_at: datetime | None = None


class ApiKeyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    key_prefix: str
    scopes: list[str]
    last_used_at: datetime | None
    expires_at: datetime | None
    is_active: bool
    created_at: datetime


class ApiKeyCreated(ApiKeyRead):
    """Creation response only. `key` is the plaintext and is returned exactly
    once — it is not stored, so it cannot be shown again."""

    key: str


# ── webhooks ─────────────────────────────────────────────────────────────────
class WebhookEndpointCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    url: str = Field(min_length=1, max_length=1024)
    event_codes: list[str] = Field(min_length=1)

    @field_validator("url")
    @classmethod
    def _http_only(cls, v: str) -> str:
        # Signed payloads still shouldn't travel in the clear, and a non-HTTP
        # scheme (file://, gopher://) would make this an SSRF primitive.
        if not v.startswith(("http://", "https://")):
            raise ValueError("url must be http:// or https://")
        return v


class WebhookEndpointUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    url: str | None = Field(default=None, min_length=1, max_length=1024)
    event_codes: list[str] | None = None
    is_active: bool | None = None

    @field_validator("url")
    @classmethod
    def _http_only(cls, v: str | None) -> str | None:
        if v is not None and not v.startswith(("http://", "https://")):
            raise ValueError("url must be http:// or https://")
        return v


class WebhookEndpointRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    url: str
    event_codes: list[str]
    is_active: bool
    created_at: datetime


class WebhookEndpointCreated(WebhookEndpointRead):
    """`secret` is shown on create so the subscriber can verify signatures."""

    secret: str


class WebhookDeliveryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    endpoint_id: uuid.UUID
    event_code: str
    payload: dict
    status: str
    attempts: int
    response_code: int | None
    error: str | None
    next_retry_at: datetime | None
    delivered_at: datetime | None
    created_at: datetime
