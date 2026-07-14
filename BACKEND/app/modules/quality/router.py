"""Quality HTTP router (docs/02 §14, §21).

Permission gates: reads `qual.read`; writes `qual.manage`. The `/trends` route is
declared before `/{ncr_id}` so the id path doesn't shadow it.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams
from app.common.responses import success
from app.core.database import get_session
from app.modules.auth.dependencies import CurrentUser, require
from app.modules.quality.schemas import NCRCreate, NCRRead, NCRUpdate
from app.modules.quality.service import NCRService, QualityTrendsService

router = APIRouter(tags=["quality"])


def _page(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
          sort: str | None = Query("-detected_at")) -> PageParams:
    return PageParams(page=page, page_size=page_size, sort=sort)


@router.get("/quality/ncrs/trends", summary="Defect Pareto + deviation-rate trends")
async def ncr_trends(actor: CurrentUser = Depends(require("qual.read")),
                     session: AsyncSession = Depends(get_session)) -> dict:
    data = await QualityTrendsService(session, actor.tenant_id).compute()
    return success(data)


@router.get("/quality/ncrs", summary="List NCRs")
async def list_ncrs(params: PageParams = Depends(_page),
                    status: str | None = Query(None),
                    severity: str | None = Query(None),
                    area_id: uuid.UUID | None = Query(None),
                    equipment_id: uuid.UUID | None = Query(None),
                    defect_type_id: uuid.UUID | None = Query(None),
                    actor: CurrentUser = Depends(require("qual.read")),
                    session: AsyncSession = Depends(get_session)) -> dict:
    page = await NCRService(session, actor.tenant_id).list(
        params, status=status, severity=severity, area_id=area_id,
        equipment_id=equipment_id, defect_type_id=defect_type_id)
    return success([NCRRead.model_validate(n).model_dump() for n in page.items], meta=page.meta)


@router.post("/quality/ncrs", status_code=201, summary="Create an NCR")
async def create_ncr(body: NCRCreate,
                     actor: CurrentUser = Depends(require("qual.manage")),
                     session: AsyncSession = Depends(get_session)) -> dict:
    ncr = await NCRService(session, actor.tenant_id).create(data=body, actor=actor)
    return success(NCRRead.model_validate(ncr).model_dump())


@router.get("/quality/ncrs/{ncr_id}", summary="Get an NCR")
async def get_ncr(ncr_id: uuid.UUID,
                  actor: CurrentUser = Depends(require("qual.read")),
                  session: AsyncSession = Depends(get_session)) -> dict:
    ncr = await NCRService(session, actor.tenant_id).get(ncr_id)
    return success(NCRRead.model_validate(ncr).model_dump())


@router.patch("/quality/ncrs/{ncr_id}", summary="Update an NCR")
async def update_ncr(ncr_id: uuid.UUID, body: NCRUpdate,
                     actor: CurrentUser = Depends(require("qual.manage")),
                     session: AsyncSession = Depends(get_session)) -> dict:
    ncr = await NCRService(session, actor.tenant_id).update(ncr_id, data=body, actor=actor)
    return success(NCRRead.model_validate(ncr).model_dump())


@router.delete("/quality/ncrs/{ncr_id}", summary="Delete an NCR")
async def delete_ncr(ncr_id: uuid.UUID,
                     actor: CurrentUser = Depends(require("qual.manage")),
                     session: AsyncSession = Depends(get_session)) -> dict:
    await NCRService(session, actor.tenant_id).delete(ncr_id, actor=actor)
    return success({"message": "NCR deleted"})
