"""Audit-log read schemas (docs/02 §25). Writing is internal-only (service layer)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    tenant_id: uuid.UUID | None = None
    actor_id: uuid.UUID | None = None
    actor_ip: str | None = None
    action: str
    entity_type: str
    entity_id: str | None = None
    before: dict | None = None
    after: dict | None = None
    request_id: str | None = None
    created_at: datetime
