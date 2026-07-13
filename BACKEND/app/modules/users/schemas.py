"""Users / roles / permissions / feature-flag schemas (docs/02 §13, §24, §41)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ── permissions ──────────────────────────────────────────────────────────────
class PermissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    code: str
    resource: str
    action: str
    description: str | None = None


# ── roles ────────────────────────────────────────────────────────────────────
class RoleCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=255)
    permission_ids: list[uuid.UUID] = Field(default_factory=list)


class RoleUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=255)
    version: int | None = None


class RoleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    description: str | None = None
    is_system: bool
    version: int
    permissions: list[str] = Field(default_factory=list)


class RolePermissionsUpdate(BaseModel):
    permission_ids: list[uuid.UUID]


# ── users ────────────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=256)
    phone: str | None = Field(default=None, max_length=32)
    role_ids: list[uuid.UUID] = Field(default_factory=list)


class UserInvite(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    role_ids: list[uuid.UUID] = Field(default_factory=list)


class UserUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    locale: str | None = Field(default=None, max_length=16)
    theme: str | None = Field(default=None, max_length=16)
    role_ids: list[uuid.UUID] | None = None
    version: int | None = None


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    tenant_id: uuid.UUID
    email: str
    full_name: str
    phone: str | None = None
    status: str
    locale: str
    theme: str
    mfa_enabled: bool
    last_login_at: datetime | None = None
    version: int
    roles: list[str] = Field(default_factory=list)


# ── feature flags ────────────────────────────────────────────────────────────
class FeatureFlagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    key: str
    enabled: bool
    role_scope: list[str] = Field(default_factory=list)
    rollout_pct: int = 100


class FeatureFlagUpsert(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    key: str = Field(min_length=1, max_length=128)
    enabled: bool = False
    role_scope: list[str] = Field(default_factory=list)
    rollout_pct: int = Field(default=100, ge=0, le=100)


class MessageResponse(BaseModel):
    message: str
