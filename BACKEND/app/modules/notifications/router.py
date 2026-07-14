"""Notification HTTP router (docs/02 §20).

The inbox endpoints are per-user (any authenticated user sees only their own
notifications) — gated by `get_current_user`, not a resource permission. Only
`broadcast` requires `notif.manage`. `events` import registers the routing
subscriber.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams
from app.common.responses import success
from app.core.database import get_session
from app.modules.auth.dependencies import CurrentUser, get_current_user, require
from app.modules.notifications import events as _events  # noqa: F401 — registers subscribers
from app.modules.notifications.schemas import (
    BroadcastRequest,
    MarkReadRequest,
    NotificationRead,
    PreferencesUpdate,
)
from app.modules.notifications.service import NotificationService

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _page(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)) -> PageParams:
    return PageParams(page=page, page_size=page_size, sort="-created_at")


@router.get("", summary="List my notifications")
async def list_notifications(params: PageParams = Depends(_page),
                             unread: bool | None = Query(None),
                             priority: str | None = Query(None),
                             category: str | None = Query(None),
                             actor: CurrentUser = Depends(get_current_user),
                             session: AsyncSession = Depends(get_session)) -> dict:
    svc = NotificationService(session, actor.tenant_id)
    page = await svc.list(actor.id, params, unread=unread, priority=priority, category=category)
    meta = dict(page.meta)
    meta["unread_count"] = await svc.unread_count(actor.id)
    return success([NotificationRead.model_validate(n).model_dump() for n in page.items], meta=meta)


@router.post("/mark-read", summary="Mark notifications read (ids or all)")
async def mark_read(body: MarkReadRequest,
                    actor: CurrentUser = Depends(get_current_user),
                    session: AsyncSession = Depends(get_session)) -> dict:
    n = await NotificationService(session, actor.tenant_id).mark_read(
        actor.id, ids=body.ids, all_=body.all)
    return success({"marked_read": n})


@router.get("/preferences", summary="Notification preference matrix")
async def get_preferences(actor: CurrentUser = Depends(get_current_user),
                          session: AsyncSession = Depends(get_session)) -> dict:
    prefs = await NotificationService(session, actor.tenant_id).preferences(actor.id)
    return success({"preferences": prefs})


@router.put("/preferences", summary="Update notification preferences")
async def put_preferences(body: PreferencesUpdate,
                          actor: CurrentUser = Depends(get_current_user),
                          session: AsyncSession = Depends(get_session)) -> dict:
    prefs = await NotificationService(session, actor.tenant_id).set_preferences(
        actor.id, updates=body.preferences)
    return success({"preferences": prefs})


@router.post("/broadcast", summary="Broadcast a notification (admin)")
async def broadcast(body: BroadcastRequest,
                    actor: CurrentUser = Depends(require("notif.manage")),
                    session: AsyncSession = Depends(get_session)) -> dict:
    n = await NotificationService(session, actor.tenant_id).broadcast(
        category=body.category, priority=body.priority, title=body.title, body=body.body,
        audience=body.audience, actor=actor)
    return success({"delivered": n})
