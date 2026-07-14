"""Ingestion admin router — queue monitor (docs/02 §11, §24 admin).

Gated by `doc.reprocess` (Admin / Plant Manager / Maintenance Engineer) — the
ingestion monitor is not a general read surface. Importing this registers the
document.uploaded → Celery subscriber (via events).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams
from app.common.responses import success
from app.core.database import get_session
from app.modules.auth.dependencies import CurrentUser, require
from app.modules.ingestion import events as _events  # noqa: F401 — registers bus→queue subscriber
from app.modules.ingestion.schemas import IngestionJobRead
from app.modules.ingestion.service import IngestionService

router = APIRouter(prefix="/ingestion", tags=["ingestion"])


def _page(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
          sort: str | None = Query("-created_at")) -> PageParams:
    return PageParams(page=page, page_size=page_size, sort=sort)


@router.get("/jobs", summary="List ingestion jobs (admin monitor)")
async def list_jobs(params: PageParams = Depends(_page),
                    status: str | None = Query(None),
                    document_id: uuid.UUID | None = Query(None),
                    actor: CurrentUser = Depends(require("doc.reprocess")),
                    session: AsyncSession = Depends(get_session)) -> dict:
    page = await IngestionService(session, actor.tenant_id).list(
        params, status=status, document_id=document_id)
    return success([IngestionJobRead.model_validate(j).model_dump() for j in page.items],
                   meta=page.meta)


@router.get("/jobs/{job_id}", summary="Get an ingestion job")
async def get_job(job_id: uuid.UUID,
                  actor: CurrentUser = Depends(require("doc.reprocess")),
                  session: AsyncSession = Depends(get_session)) -> dict:
    job = await IngestionService(session, actor.tenant_id).get(job_id)
    return success(IngestionJobRead.model_validate(job).model_dump())


@router.post("/jobs/{job_id}/retry", summary="Retry an ingestion job")
async def retry_job(job_id: uuid.UUID,
                    actor: CurrentUser = Depends(require("doc.reprocess")),
                    session: AsyncSession = Depends(get_session)) -> dict:
    job = await IngestionService(session, actor.tenant_id).retry(job_id, actor=actor)
    return success(IngestionJobRead.model_validate(job).model_dump())


@router.post("/jobs/{job_id}/cancel", summary="Cancel an ingestion job")
async def cancel_job(job_id: uuid.UUID,
                     actor: CurrentUser = Depends(require("doc.reprocess")),
                     session: AsyncSession = Depends(get_session)) -> dict:
    job = await IngestionService(session, actor.tenant_id).cancel(job_id, actor=actor)
    return success(IngestionJobRead.model_validate(job).model_dump())
