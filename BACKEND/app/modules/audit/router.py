"""Audit-log HTTP router — read-only (docs/02 §25).

Writing is internal-only (service layer + DB trigger defence). All reads require
`audit.read`.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams
from app.common.responses import success
from app.core.database import get_session
from app.modules.audit.schemas import AuditLogRead
from app.modules.audit.service import AuditService
from app.modules.auth.dependencies import CurrentUser, require

router = APIRouter(prefix="/audit-log", tags=["audit"])

# The admin audit-log viewer (docs/08 N3). Same data as /audit-log, gated by the
# dedicated `audit.view` permission and mounted where the admin UI expects it.
# before/after JSONB diffs already exist on every row (migration 0002), so the
# viewer's row-expand diff needs no schema change.
admin_router = APIRouter(prefix="/admin/audit-log", tags=["audit"])


@admin_router.get("", summary="Audit-log viewer (filters + pagination)")
async def admin_audit_log(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort: str | None = Query("-created_at"),
    actor_id: uuid.UUID | None = Query(None),
    action: str | None = Query(None),
    entity_type: str | None = Query(None),
    entity_id: str | None = Query(None),
    date_from: datetime | None = Query(None, alias="from"),
    date_to: datetime | None = Query(None, alias="to"),
    actor: CurrentUser = Depends(require("audit.view")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    params = PageParams(page=page, page_size=page_size, sort=sort)
    result = await AuditService(session).query(
        tenant_id=actor.tenant_id, params=params, actor_id=actor_id, action=action,
        entity_type=entity_type, entity_id=entity_id, date_from=date_from, date_to=date_to)
    return success([AuditLogRead.model_validate(r).model_dump() for r in result.items],
                   meta=result.meta)


def _page(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
          sort: str | None = Query("-created_at")) -> PageParams:
    return PageParams(page=page, page_size=page_size, sort=sort)


@router.get("", summary="Query the audit log")
async def query_audit(
    params: PageParams = Depends(_page),
    actor_id: uuid.UUID | None = Query(None),
    action: str | None = Query(None),
    entity_type: str | None = Query(None),
    entity_id: str | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    actor: CurrentUser = Depends(require("audit.read")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    page = await AuditService(session).query(
        tenant_id=actor.tenant_id, params=params, actor_id=actor_id, action=action,
        entity_type=entity_type, entity_id=entity_id, date_from=date_from, date_to=date_to,
    )
    return success([AuditLogRead.model_validate(r).model_dump() for r in page.items], meta=page.meta)


@router.get("/entity/{entity_type}/{entity_id}", summary="History for one record")
async def entity_history(
    entity_type: str, entity_id: str,
    params: PageParams = Depends(_page),
    actor: CurrentUser = Depends(require("audit.read")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    page = await AuditService(session).for_entity(
        tenant_id=actor.tenant_id, entity_type=entity_type, entity_id=entity_id, params=params)
    return success([AuditLogRead.model_validate(r).model_dump() for r in page.items], meta=page.meta)
