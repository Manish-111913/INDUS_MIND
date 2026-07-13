"""Document schemas (docs/02 §13, §17, §41)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# ── upload flow ──────────────────────────────────────────────────────────────
class UploadUrlRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    filename: str = Field(min_length=1, max_length=512)
    mime: str = Field(min_length=1, max_length=255)
    size: int = Field(ge=1)
    title: str | None = Field(default=None, max_length=512)


class UploadUrlResponse(BaseModel):
    document_id: uuid.UUID
    presigned_url: str
    storage_key: str


class ConfirmMeta(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    doc_type_id: uuid.UUID | None = None
    plant_id: uuid.UUID | None = None
    title: str | None = Field(default=None, max_length=512)
    language: str | None = Field(default=None, max_length=16)
    tags: list[str] = Field(default_factory=list)


class ConfirmRequest(BaseModel):
    checksum: str = Field(min_length=8, max_length=128)
    meta: ConfirmMeta = Field(default_factory=ConfirmMeta)


# ── reads ────────────────────────────────────────────────────────────────────
class DocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    plant_id: uuid.UUID | None = None
    title: str
    doc_type_id: uuid.UUID | None = None
    source: str
    mime: str
    size_bytes: int | None = None
    checksum: str | None = None
    language: str | None = None
    current_version_id: uuid.UUID | None = None
    ingestion_status: str
    ingestion_error: str | None = None
    page_count: int | None = None
    tags: list[str]
    meta: dict
    version: int
    created_at: datetime


class JobStagesRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    status: str
    current_stage: str | None = None
    stages: list
    durations: dict = {}
    error: str | None = None
    retries: int


class DocumentDetail(DocumentRead):
    job: JobStagesRead | None = None


class VersionCreateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    filename: str = Field(min_length=1, max_length=512)
    mime: str = Field(min_length=1, max_length=255)
    size: int = Field(ge=1)
    notes: str | None = Field(default=None, max_length=1024)


class VersionCreateResponse(BaseModel):
    document_id: uuid.UUID
    version_no: int
    presigned_url: str
    storage_key: str


class VersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    document_id: uuid.UUID
    version_no: int
    mime: str
    size_bytes: int | None = None
    checksum: str | None = None
    notes: str | None = None
    confirmed_at: datetime | None = None
    created_at: datetime


class ReprocessRequest(BaseModel):
    from_stage: str | None = None


class UrlResponse(BaseModel):
    url: str


class MessageResponse(BaseModel):
    message: str
