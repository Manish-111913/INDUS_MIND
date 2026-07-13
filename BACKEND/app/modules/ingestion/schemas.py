"""Ingestion schemas (docs/02 §13, §11)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


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


class MessageResponse(BaseModel):
    message: str
