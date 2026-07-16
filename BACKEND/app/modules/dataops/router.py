"""Import / export / reporting routers (docs/05 S6).

Import + export are self-service (`imports.run` / `exports.run`); report
templates + schedules are admin (`reports.manage`).
"""

from __future__ import annotations

import io
import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.responses import success
from app.core.database import get_session
from app.modules.auth.dependencies import CurrentUser, require
from app.modules.dataops.export_service import ExportService
from app.modules.dataops.import_service import ImportService
from app.modules.dataops.report_service import ReportService
from app.modules.dataops.schemas import (
    ExportRequest,
    ImportApply,
    ImportJobCreate,
    ImportJobRead,
    ReportRunRequest,
    ReportScheduleCreate,
    ReportScheduleRead,
    ReportTemplateRead,
)

import_router = APIRouter(tags=["imports"])
export_router = APIRouter(tags=["exports"])
report_router = APIRouter(prefix="/admin", tags=["reports"])


def _job(row) -> dict:
    return ImportJobRead.model_validate(row).model_dump()


# ── import ────────────────────────────────────────────────────────────────────
@import_router.get("/import/templates/{entity}", summary="Header-only CSV template for an entity")
async def import_template(entity: str,
                          actor: CurrentUser = Depends(require("imports.run")),
                          session: AsyncSession = Depends(get_session)) -> StreamingResponse:
    csv_text = await ImportService(session, actor.tenant_id).template_csv(entity)
    return StreamingResponse(io.StringIO(csv_text), media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename={entity}.csv"})


@import_router.post("/import/jobs", status_code=201, summary="Create + validate an import job")
async def create_import(body: ImportJobCreate,
                        actor: CurrentUser = Depends(require("imports.run")),
                        session: AsyncSession = Depends(get_session)) -> dict:
    job = await ImportService(session, actor.tenant_id).create_job(
        entity=body.entity, file_key=body.file_key, actor=actor)
    return success(_job(job))


@import_router.get("/import/jobs/{job_id}", summary="Get an import job")
async def get_import(job_id: uuid.UUID,
                     actor: CurrentUser = Depends(require("imports.run")),
                     session: AsyncSession = Depends(get_session)) -> dict:
    job = await ImportService(session, actor.tenant_id).get(job_id)
    return success(_job(job))


@import_router.patch("/import/jobs/{job_id}", summary="Confirm mapping → apply import")
async def apply_import(job_id: uuid.UUID, body: ImportApply,
                       actor: CurrentUser = Depends(require("imports.run")),
                       session: AsyncSession = Depends(get_session)) -> dict:
    job = await ImportService(session, actor.tenant_id).apply(job_id, mapping=body.mapping, actor=actor)
    return success(_job(job))


# ── export ────────────────────────────────────────────────────────────────────
@export_router.post("/exports", summary="Export a table (sync file ≤2000 rows, else a job)")
async def create_export(body: ExportRequest,
                        actor: CurrentUser = Depends(require("exports.run")),
                        session: AsyncSession = Depends(get_session)):
    result = await ExportService(session, actor.tenant_id).export(
        entity=body.entity, filters=body.filters, columns=body.columns, fmt=body.format, actor=actor)
    if result.get("sync"):
        return StreamingResponse(
            io.BytesIO(result["blob"]), media_type=result["content_type"],
            headers={"Content-Disposition": f"attachment; filename={result['filename']}"})
    return success(result)


@export_router.get("/exports/{job_id}", summary="Get an export job (async)")
async def get_export(job_id: uuid.UUID,
                     actor: CurrentUser = Depends(require("exports.run")),
                     session: AsyncSession = Depends(get_session)) -> dict:
    from app.core import storage

    job = await ExportService(session, actor.tenant_id).get(job_id)
    url = storage.presigned_get(job.file_key) if job.file_key else None
    return success({"id": str(job.id), "entity": job.entity, "status": job.status,
                    "row_count": job.row_count, "format": job.format, "download_url": url})


# ── reports (admin) ───────────────────────────────────────────────────────────
@report_router.get("/reports", summary="List report templates (admin)")
async def list_reports(actor: CurrentUser = Depends(require("reports.manage")),
                       session: AsyncSession = Depends(get_session)) -> dict:
    rows = await ReportService(session, actor.tenant_id).list_templates()
    return success([ReportTemplateRead.model_validate(r).model_dump() for r in rows])


@report_router.post("/reports/{template_id}/run", summary="Run a report template now (admin)")
async def run_report(template_id: uuid.UUID, body: ReportRunRequest | None = None,
                     actor: CurrentUser = Depends(require("reports.manage")),
                     session: AsyncSession = Depends(get_session)) -> dict:
    data = await ReportService(session, actor.tenant_id).run(
        template_id, params=(body.params if body else None), actor=actor)
    return success(data)


@report_router.get("/report-schedules", summary="List report schedules (admin)")
async def list_schedules(actor: CurrentUser = Depends(require("reports.manage")),
                         session: AsyncSession = Depends(get_session)) -> dict:
    rows = await ReportService(session, actor.tenant_id).list_schedules()
    return success([ReportScheduleRead.model_validate(r).model_dump() for r in rows])


@report_router.post("/report-schedules", status_code=201, summary="Create a report schedule (admin)")
async def create_schedule(body: ReportScheduleCreate,
                          actor: CurrentUser = Depends(require("reports.manage")),
                          session: AsyncSession = Depends(get_session)) -> dict:
    row = await ReportService(session, actor.tenant_id).create_schedule(
        template_id=body.template_id, cron_expr=body.cron_expr, recipients=body.recipients,
        locale=body.locale, is_active=body.is_active, actor=actor)
    return success(ReportScheduleRead.model_validate(row).model_dump())
