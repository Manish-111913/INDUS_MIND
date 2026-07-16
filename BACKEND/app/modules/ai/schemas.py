"""AI / chat schemas (docs/02 §13, §15, §16)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.common.schemas import StrictModel


# ── /ai/query ────────────────────────────────────────────────────────────────
class AIQueryRequest(StrictModel):
    query: str = Field(min_length=1)
    scope: dict = Field(default_factory=dict)


class Confidence(BaseModel):
    level: str
    score: float


class AIQueryResponse(BaseModel):
    answer: str
    citations: list[dict]
    confidence: Confidence
    latency_ms: int
    cached: bool = False


# ── chat ─────────────────────────────────────────────────────────────────────
class ChatSessionCreate(StrictModel):
    title: str | None = Field(default=None, max_length=255)
    scope: dict = Field(default_factory=dict)


class ChatSessionUpdate(StrictModel):
    title: str | None = Field(default=None, max_length=255)
    pinned: bool | None = None


class ChatSessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    title: str | None = None
    scope: dict
    pinned: bool
    created_at: datetime
    updated_at: datetime


class MessageCreate(StrictModel):
    content: str = Field(min_length=1)


class ChatMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    role: str
    content: str
    citations: list
    confidence: float | None = None
    confidence_level: str | None = None
    latency_ms: int | None = None
    cached: bool
    feedback: str | None = None
    created_at: datetime


class FeedbackRequest(StrictModel):
    value: str = Field(pattern=r"^(up|down)$")
    reason: str | None = Field(default=None, max_length=1024)  # legacy free-text (→ comment)
    reason_code: str | None = Field(default=None, max_length=64)  # lookups(ai_feedback_reason)
    comment: str | None = Field(default=None, max_length=1024)


# ── insights / evals ─────────────────────────────────────────────────────────
class InsightRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    role: str | None = None
    category: str
    title: str
    body: str
    confidence: float | None = None
    evidence: list
    actions: list
    entity_type: str | None = None
    entity_id: uuid.UUID | None = None


class EvalRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    status: str
    summary: dict
    results: list
    created_at: datetime


# ── RCA (docs/02 §7, §15) ─────────────────────────────────────────────────────
class RCARead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    failure_id: uuid.UUID
    method: str
    status: str
    ai_output: dict
    five_why: list
    fishbone: dict
    human_edits: dict
    root_cause_final: str | None = None
    corrective_actions: list
    confidence: float | None = None
    published_at: datetime | None = None
    version: int


class RCAUpdate(StrictModel):
    root_cause_final: str | None = None
    corrective_actions: list | None = None
    human_edits: dict | None = None
    five_why: list | None = None


class RCAPublish(StrictModel):
    spawn_work_orders: bool = True
