"""Bulk-action router (docs/08 N4).

One endpoint shape per resource. Each validates the action against the resource's
`bulk_actions_*` lookup, runs each id through the resource's handler under a
per-row savepoint (so one bad row doesn't poison the rest), and returns
partial-success results.
"""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.responses import success
from app.core.database import get_session
from app.core.exceptions import ValidationFailed
from app.modules.auth.dependencies import CurrentUser, get_current_user
from app.modules.lookups.models import Lookup

router = APIRouter(tags=["bulk"])


class BulkRequest(BaseModel):
    action: str = Field(min_length=1, max_length=64)
    ids: list[uuid.UUID] = Field(min_length=1, max_length=500)
    params: dict = Field(default_factory=dict)


async def _valid_actions(session: AsyncSession, tenant_id, resource: str) -> set[str]:
    category = f"bulk_actions_{resource}"
    rows = (await session.execute(
        select(Lookup.code).where(
            Lookup.category == category,
            (Lookup.tenant_id == tenant_id) | (Lookup.tenant_id.is_(None))))).scalars().all()
    return set(rows)


async def _run_bulk(
    session: AsyncSession, actor: CurrentUser, resource: str, body: BulkRequest,
    handler: Callable[[uuid.UUID], Awaitable[None]],
) -> dict:
    valid = await _valid_actions(session, actor.tenant_id, resource)
    if body.action not in valid:
        raise ValidationFailed(
            f"Unknown bulk action '{body.action}' for {resource}. Allowed: {sorted(valid)}",
            code="BULK_ACTION_UNKNOWN", http_status=422)

    ok: list[str] = []
    failed: list[dict] = []
    for rid in body.ids:
        # Per-row savepoint: a failure rolls back only this row, so the report is
        # honest and one bad id can't abort the whole batch.
        sp = await session.begin_nested()
        try:
            await handler(rid)
            await sp.commit()
            ok.append(str(rid))
        except Exception as exc:  # noqa: BLE001 — partial success is the expected outcome
            await sp.rollback()
            failed.append({"id": str(rid), "reason": str(exc)})
    await session.commit()
    return success({"ok": ok, "failed": failed})


def _require(actor: CurrentUser, permission: str) -> None:
    if permission not in actor.perms:
        raise ValidationFailed(f"Missing permission: {permission}", code="PERMISSION_DENIED",
                               http_status=403)


@router.post("/work-orders/bulk", summary="Bulk action on work orders")
async def bulk_work_orders(
    body: BulkRequest,
    actor: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    from app.modules.maintenance.service import WorkOrderService

    svc = WorkOrderService(session, actor.tenant_id)

    async def handle(rid: uuid.UUID) -> None:
        wo = await svc.get(rid)
        if body.action == "assign":
            _require(actor, "wo.assign")
            assignee = body.params.get("assignee_id")
            if not assignee:
                raise ValueError("assignee_id is required")
            await svc.assign(rid, assignee_id=uuid.UUID(str(assignee)), version=wo.version,
                             actor=actor)
        elif body.action == "status":
            _require(actor, "wo.close")
            target = body.params.get("status")
            if not target:
                raise ValueError("status is required")
            await svc.transition(rid, target=target, note=body.params.get("note"),
                                 version=wo.version, actor=actor)
        elif body.action == "export":
            _require(actor, "wo.export")
            # Selection-only action; the export itself is a separate flow.
        else:
            raise ValueError(f"unsupported action {body.action}")

    return await _run_bulk(session, actor, "work_orders", body, handle)


@router.post("/notifications/bulk", summary="Bulk action on notifications")
async def bulk_notifications(
    body: BulkRequest,
    actor: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    from app.modules.notifications.service import NotificationService

    svc = NotificationService(session, actor.tenant_id)

    async def handle(rid: uuid.UUID) -> None:
        if body.action == "mark_read":
            await svc.mark_read(actor.id, ids=[rid], all_=False)
        else:
            raise ValueError(f"unsupported action {body.action}")

    return await _run_bulk(session, actor, "notifications", body, handle)


@router.post("/documents/bulk", summary="Bulk action on documents")
async def bulk_documents(
    body: BulkRequest,
    actor: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    from app.modules.documents.service import DocumentService

    svc = DocumentService(session, actor.tenant_id)

    async def handle(rid: uuid.UUID) -> None:
        if body.action == "tag":
            _require(actor, "doc.update")
            tag = body.params.get("tag")
            if not tag:
                raise ValueError("tag is required")
            doc = await svc.get(rid)
            if tag not in (doc.tags or []):
                doc.tags = [*(doc.tags or []), tag]
                await session.flush()
        elif body.action == "reingest":
            _require(actor, "doc.reprocess")
            await svc.reprocess(rid, from_stage=None, actor=actor)
        elif body.action == "delete":
            _require(actor, "doc.delete")
            await svc.delete(rid, actor=actor)
        else:
            raise ValueError(f"unsupported action {body.action}")

    return await _run_bulk(session, actor, "documents", body, handle)
