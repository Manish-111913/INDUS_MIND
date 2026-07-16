"""Spare-parts router (docs/08 S12).

Parts catalogue + stock adjust under `parts.manage`; the WO parts sub-resource
under `wo.close` (planning/recording parts is part of executing a work order).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.responses import success
from app.core.database import get_session
from app.modules.auth.dependencies import CurrentUser, require
from app.modules.parts.schemas import (
    PartCreate,
    PartMovementRead,
    PartRead,
    PartUpdate,
    StockAdjust,
    WorkOrderPartRead,
    WorkOrderPartUpdate,
    WorkOrderPartWrite,
)
from app.modules.parts.service import PartService

router = APIRouter(tags=["parts"])

MANAGE = "parts.manage"


def _read(part) -> dict:
    payload = PartRead.model_validate(part).model_dump()
    payload["is_low_stock"] = PartService.is_low(part)
    return payload


@router.get("/parts", summary="List parts (optionally low-stock only)")
async def list_parts(
    low_stock: bool = Query(False),
    is_active: bool | None = Query(None),
    q: str | None = Query(None),
    actor: CurrentUser = Depends(require("equip.read")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    rows = await PartService(session, actor.tenant_id).list(
        low_stock=low_stock, is_active=is_active, q=q)
    return success([_read(r) for r in rows])


@router.post("/parts", status_code=201, summary="Create a part")
async def create_part(
    body: PartCreate,
    actor: CurrentUser = Depends(require(MANAGE)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    row = await PartService(session, actor.tenant_id).create(body, actor.id)
    await session.commit()
    await session.refresh(row)
    return success(_read(row))


@router.get("/parts/{part_id}", summary="Get a part")
async def get_part(
    part_id: uuid.UUID,
    actor: CurrentUser = Depends(require("equip.read")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    row = await PartService(session, actor.tenant_id).get(part_id)
    return success(_read(row))


@router.patch("/parts/{part_id}", summary="Update a part")
async def update_part(
    part_id: uuid.UUID,
    body: PartUpdate,
    actor: CurrentUser = Depends(require(MANAGE)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    svc = PartService(session, actor.tenant_id)
    row = await svc.update(part_id, body, actor.id)
    await session.commit()
    await session.refresh(row)
    return success(_read(row))


@router.post("/parts/{part_id}/adjust", summary="Adjust stock (writes a movement)")
async def adjust_stock(
    part_id: uuid.UUID,
    body: StockAdjust,
    actor: CurrentUser = Depends(require(MANAGE)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    svc = PartService(session, actor.tenant_id)
    row = await svc.adjust(part_id, body.delta, body.reason, actor.id)
    await session.commit()
    await session.refresh(row)
    return success(_read(row))


@router.get("/parts/{part_id}/movements", summary="Stock movement history")
async def part_movements(
    part_id: uuid.UUID,
    actor: CurrentUser = Depends(require("equip.read")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    from sqlalchemy import select

    from app.modules.parts.models import PartMovement

    await PartService(session, actor.tenant_id).get(part_id)  # tenant check
    rows = (await session.execute(
        select(PartMovement).where(PartMovement.part_id == part_id,
                                   PartMovement.tenant_id == actor.tenant_id)
        .order_by(PartMovement.created_at.desc()))).scalars().all()
    return success([PartMovementRead.model_validate(r).model_dump() for r in rows])


# ── work-order parts ─────────────────────────────────────────────────────────
@router.get("/work-orders/{wo_id}/parts", summary="Parts planned on a work order")
async def list_wo_parts(
    wo_id: uuid.UUID,
    actor: CurrentUser = Depends(require("wo.read")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    rows = await PartService(session, actor.tenant_id).list_wo_parts(wo_id)
    return success([WorkOrderPartRead.model_validate(r).model_dump() for r in rows])


@router.post("/work-orders/{wo_id}/parts", status_code=201, summary="Plan a part on a work order")
async def add_wo_part(
    wo_id: uuid.UUID,
    body: WorkOrderPartWrite,
    actor: CurrentUser = Depends(require("wo.close")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    svc = PartService(session, actor.tenant_id)
    row = await svc.add_wo_part(wo_id, body, actor.id)
    await session.commit()
    return success(WorkOrderPartRead.model_validate(row).model_dump())


@router.patch("/work-orders/{wo_id}/parts/{wo_part_id}", summary="Update a planned/used part")
async def update_wo_part(
    wo_id: uuid.UUID,
    wo_part_id: uuid.UUID,
    body: WorkOrderPartUpdate,
    actor: CurrentUser = Depends(require("wo.close")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    svc = PartService(session, actor.tenant_id)
    row = await svc.update_wo_part(wo_part_id, body, actor.id)
    await session.commit()
    return success(WorkOrderPartRead.model_validate(row).model_dump())


@router.delete("/work-orders/{wo_id}/parts/{wo_part_id}", status_code=204,
               summary="Remove a planned part")
async def delete_wo_part(
    wo_id: uuid.UUID,
    wo_part_id: uuid.UUID,
    actor: CurrentUser = Depends(require("wo.close")),
    session: AsyncSession = Depends(get_session),
):
    await PartService(session, actor.tenant_id).delete_wo_part(wo_part_id)
    await session.commit()
