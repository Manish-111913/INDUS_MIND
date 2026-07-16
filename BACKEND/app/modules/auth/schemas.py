"""Auth request/response schemas (docs/02 §13, §24, §41)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.common.schemas import StrictModel


# ── login / tokens ───────────────────────────────────────────────────────────
class LoginRequest(StrictModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)
    mfa_code: str | None = Field(default=None, pattern=r"^\d{6}$")


class RegisterRequest(StrictModel):
    # `EmailStr` accepts any valid address — registration is not domain-locked.
    full_name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    tenant_id: uuid.UUID
    email: str
    full_name: str
    status: str
    locale: str
    theme: str
    mfa_enabled: bool
    last_login_at: datetime | None = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserRead


class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


# ── sessions ─────────────────────────────────────────────────────────────────
class SessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    device: str | None = None
    ip: str | None = None
    ua: str | None = None
    last_seen_at: datetime | None = None
    created_at: datetime
    current: bool = False


# ── password reset ───────────────────────────────────────────────────────────
class ForgotPasswordRequest(StrictModel):
    email: EmailStr


class ResetPasswordRequest(StrictModel):
    token: str = Field(min_length=8, max_length=256)
    new_password: str = Field(min_length=8, max_length=256)


class ChangePasswordRequest(StrictModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8, max_length=256)


# ── MFA ──────────────────────────────────────────────────────────────────────
class MfaSetupResponse(BaseModel):
    secret: str
    otpauth_uri: str


class MfaVerifyRequest(StrictModel):
    code: str = Field(pattern=r"^\d{6}$")


class MessageResponse(BaseModel):
    message: str
