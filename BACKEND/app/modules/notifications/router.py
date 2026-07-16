"""Notification HTTP router (docs/02 §20).

The inbox endpoints are per-user (any authenticated user sees only their own
notifications) — gated by `get_current_user`, not a resource permission. Only
`broadcast` requires `notif.manage`. `events` import registers the routing
subscriber.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams
from app.common.responses import success
from app.core.database import get_session
from app.modules.auth.dependencies import CurrentUser, get_current_user, require
from app.modules.notifications import events as _events  # noqa: F401 — registers subscribers
from app.modules.notifications.schemas import (
    BroadcastRequest,
    EventPreferencesUpdate,
    MarkReadRequest,
    NotificationRead,
    PreferencesUpdate,
    TemplateCreate,
    TemplatePreviewRequest,
    TemplateRead,
    TemplateUpdate,
)
from app.modules.notifications.service import (
    EventPreferenceService,
    NotificationService,
    TemplateService,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])
# Separate router for the /me and /admin surfaces (docs/05 S3), mounted alongside.
me_router = APIRouter(tags=["notifications"])
admin_router = APIRouter(prefix="/admin/notification-templates", tags=["notifications"])


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


# ── /me event-preference matrix (docs/05 S3) ──────────────────────────────────
@me_router.get("/me/notification-preferences", summary="My event notification preferences")
async def get_event_preferences(actor: CurrentUser = Depends(get_current_user),
                                session: AsyncSession = Depends(get_session)) -> dict:
    prefs = await EventPreferenceService(session, actor.tenant_id).matrix(actor.id)
    return success({"preferences": prefs})


@me_router.put("/me/notification-preferences", summary="Update my event notification preferences")
async def put_event_preferences(body: EventPreferencesUpdate,
                                actor: CurrentUser = Depends(get_current_user),
                                session: AsyncSession = Depends(get_session)) -> dict:
    prefs = await EventPreferenceService(session, actor.tenant_id).set(
        actor.id, updates=body.preferences)
    return success({"preferences": prefs})


# ── /admin notification templates (docs/05 S3) ────────────────────────────────
def _tpl(row) -> dict:
    return TemplateRead.model_validate(row).model_dump()


_TPL_PERM = "notifications.templates.manage"


@admin_router.get("", summary="List notification templates (admin)")
async def list_templates(event_code: str | None = Query(None),
                         actor: CurrentUser = Depends(require(_TPL_PERM)),
                         session: AsyncSession = Depends(get_session)) -> dict:
    rows = await TemplateService(session, actor.tenant_id).list(event_code=event_code)
    return success([_tpl(r) for r in rows])


@admin_router.post("", status_code=201, summary="Create a tenant template override (admin)")
async def create_template(body: TemplateCreate,
                          actor: CurrentUser = Depends(require(_TPL_PERM)),
                          session: AsyncSession = Depends(get_session)) -> dict:
    row = await TemplateService(session, actor.tenant_id).create(data=body, actor=actor)
    return success(_tpl(row))


@admin_router.post("/preview", summary="Render a template against a sample payload (admin)")
async def preview_template(body: TemplatePreviewRequest,
                           actor: CurrentUser = Depends(require(_TPL_PERM)),
                           session: AsyncSession = Depends(get_session)) -> dict:
    result = await TemplateService(session, actor.tenant_id).preview(
        template_id=body.template_id, subject_tpl=body.subject_tpl, body_tpl=body.body_tpl,
        sample_payload=body.sample_payload)
    return success(result)


@admin_router.patch("/{template_id}", summary="Update a tenant template (admin)")
async def update_template(template_id: uuid.UUID, body: TemplateUpdate,
                          actor: CurrentUser = Depends(require(_TPL_PERM)),
                          session: AsyncSession = Depends(get_session)) -> dict:
    row = await TemplateService(session, actor.tenant_id).update(template_id, data=body, actor=actor)
    return success(_tpl(row))


@admin_router.delete("/{template_id}", summary="Delete a tenant template (admin)")
async def delete_template(template_id: uuid.UUID,
                          actor: CurrentUser = Depends(require(_TPL_PERM)),
                          session: AsyncSession = Depends(get_session)) -> dict:
    await TemplateService(session, actor.tenant_id).delete(template_id, actor=actor)
    return success({"message": "Template deleted"})
