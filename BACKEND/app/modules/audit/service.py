"""Audit service — the internal-only writer every mutation calls (docs/02 §25, §34).

Writing is service-layer only (no public write API). The request_id is pulled
from log context when not supplied, so every audit row is correlatable.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import request_id_ctx
from app.modules.audit.models import AuditLog
from app.modules.audit.repository import AuditRepository


class AuditService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = AuditRepository(session)

    async def write(
        self,
        *,
        action: str,
        entity_type: str,
        entity_id: uuid.UUID | str | None = None,
        tenant_id: uuid.UUID | str | None = None,
        actor_id: uuid.UUID | str | None = None,
        actor_ip: str | None = None,
        before: dict[str, Any] | None = None,
        after: dict[str, Any] | None = None,
        request_id: str | None = None,
    ) -> AuditLog:
        row = AuditLog(
            tenant_id=_uuid(tenant_id),
            actor_id=_uuid(actor_id),
            actor_ip=actor_ip,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id is not None else None,
            before=before,
            after=after,
            request_id=request_id or request_id_ctx.get(),
        )
        return await self.repo.add(row)

    # ── reads (docs/02 §25) ──────────────────────────────────────────────────
    async def query(self, **kwargs):
        return await self.repo.query(**kwargs)

    async def for_entity(self, **kwargs):
        return await self.repo.for_entity(**kwargs)


def _uuid(value: uuid.UUID | str | None) -> uuid.UUID | None:
    if value is None or isinstance(value, uuid.UUID):
        return value
    return uuid.UUID(str(value))
