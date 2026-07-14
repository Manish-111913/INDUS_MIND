"""Ingestion schemas (docs/02 §13, §11)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.common.schemas import StrictModel


class IngestionJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    document_id: uuid.UUID
    version_id: uuid.UUID | None = None
    status: str
    current_stage: str | None = None
    stages: list
    error: str | None = None
    retries: int
    durations: dict
    created_at: datetime
    updated_at: datetime


class ChunkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    document_id: uuid.UUID
    chunk_index: int
    page_no: int | None = None
    section_path: str | None = None
    token_count: int | None = None
    text: str
    has_embedding: bool = False


class EntityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    document_id: uuid.UUID
    entity_type: str
    value: str
    normalized_value: str | None = None
    confidence: float | None = None
    page_no: int | None = None
    status: str
    linked_record_type: str | None = None
    linked_record_id: uuid.UUID | None = None
    version: int


class EntityUpdate(StrictModel):
    status: str  # confirmed | corrected | rejected
    value: str | None = None
    version: int | None = None


class MessageResponse(BaseModel):
    message: str
