"""Analytics HTTP router (docs/02 §22).

Reads/run need `analytics.read`; export/schedule need `analytics.export`.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.responses import success
from app.core.database import get_session
from app.modules.analytics.schemas import (
    ReportExport,
    ReportRead,
    ReportRun,
    ReportSchedule,
    ScheduledReportRead,
)
from app.modules.analytics.service import AnalyticsService
from app.modules.auth.dependencies import CurrentUser, require

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/reports", summary="List report definitions")
async def list_reports(actor: CurrentUser = Depends(require("analytics.read")),
                       session: AsyncSession = Depends(get_session)) -> dict:
    reports = await AnalyticsService(session, actor.tenant_id).list_reports()
    return success([ReportRead.model_validate(r).model_dump() for r in reports])


@router.get("/kpis", summary="Named KPI values")
async def kpis(keys: str = Query(..., description="comma-separated KPI keys"),
               actor: CurrentUser = Depends(require("analytics.read")),
               session: AsyncSession = Depends(get_session)) -> dict:
    key_list = [k.strip() for k in keys.split(",") if k.strip()]
    data = await AnalyticsService(session, actor.tenant_id).kpis(key_list, actor)
    return success(data)


@router.post("/reports/{report_id}/run", summary="Run a report → columns/rows/charts")
async def run_report(report_id: uuid.UUID, body: ReportRun | None = None,
                     actor: CurrentUser = Depends(require("analytics.read")),
                     session: AsyncSession = Depends(get_session)) -> dict:
    data = await AnalyticsService(session, actor.tenant_id).run(
        report_id, params=body.params if body else {}, actor=actor)
    return success(data)


@router.post("/reports/{report_id}/export", summary="Export a report (xlsx/pdf/csv) → download URL")
async def export_report(report_id: uuid.UUID, body: ReportExport,
                        actor: CurrentUser = Depends(require("analytics.export")),
                        session: AsyncSession = Depends(get_session)) -> dict:
    data = await AnalyticsService(session, actor.tenant_id).export(
        report_id, fmt=body.format, params=body.params, actor=actor)
    return success(data)


@router.post("/reports/{report_id}/schedule", summary="Schedule a recurring report")
async def schedule_report(report_id: uuid.UUID, body: ReportSchedule,
                          actor: CurrentUser = Depends(require("analytics.export")),
                          session: AsyncSession = Depends(get_session)) -> dict:
    sched = await AnalyticsService(session, actor.tenant_id).schedule(
        report_id, cron=body.cron, recipients=body.recipients, params=body.params,
        fmt=body.format, actor=actor)
    return success(ScheduledReportRead.model_validate(sched).model_dump())
