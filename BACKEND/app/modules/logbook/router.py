"""Shift-logbook router (docs/08 S13). Permission logbook.write."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.responses import success
from app.core.database import get_session
from app.modules.auth.dependencies import CurrentUser, require
from app.modules.logbook.schemas import ShiftLogCreate, ShiftLogRead, ShiftLogUpdate
from app.modules.logbook.service import ShiftLogService

router = APIRouter(prefix="/shift-logs", tags=["logbook"])
PERM = "logbook.write"


@router.get("", summary="List shift logs")
async def list_logs(
    plant: uuid.UUID | None = Query(None),
    shift: str | None = Query(None),
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to"),
    status: str | None = Query(None),
    actor: CurrentUser = Depends(require("copilot.use")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    rows = await ShiftLogService(session, actor.tenant_id).list(
        plant_id=plant, shift=shift, date_from=date_from, date_to=date_to, status=status)
    return success([ShiftLogRead.model_validate(r).model_dump() for r in rows])


@router.post("", status_code=201, summary="Create a draft shift log")
async def create_log(
    body: ShiftLogCreate,
    actor: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    svc = ShiftLogService(session, actor.tenant_id)
    row = await svc.create(body, actor.id)
    await session.commit()
    await svc._attach_names([row])  # re-resolve after commit expires the row
    return success(ShiftLogRead.model_validate(row).model_dump())


@router.get("/{log_id}", summary="Get a shift log")
async def get_log(
    log_id: uuid.UUID,
    actor: CurrentUser = Depends(require("copilot.use")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    row = await ShiftLogService(session, actor.tenant_id).get(log_id)
    return success(ShiftLogRead.model_validate(row).model_dump())


@router.patch("/{log_id}", summary="Edit a draft shift log")
async def update_log(
    log_id: uuid.UUID,
    body: ShiftLogUpdate,
    actor: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    svc = ShiftLogService(session, actor.tenant_id)
    row = await svc.update(log_id, body, actor.id)
    await session.commit()
    await svc._attach_names([row])  # re-resolve after commit expires the row
    return success(ShiftLogRead.model_validate(row).model_dump())


@router.post("/{log_id}/submit", summary="Submit a log (ingests it for Copilot)")
async def submit_log(
    log_id: uuid.UUID,
    actor: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    svc = ShiftLogService(session, actor.tenant_id)
    row = await svc.submit(log_id, actor.id)
    await session.commit()
    await session.refresh(row)
    await svc._attach_names([row])
    return success(ShiftLogRead.model_validate(row).model_dump())


@router.post("/{log_id}/summarize", summary="Generate an AI handover summary")
async def summarize_log(
    log_id: uuid.UUID,
    actor: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    svc = ShiftLogService(session, actor.tenant_id)
    row = await svc.summarize(log_id, actor.id)
    await session.commit()
    await session.refresh(row)
    await svc._attach_names([row])
    return success(ShiftLogRead.model_validate(row).model_dump())
