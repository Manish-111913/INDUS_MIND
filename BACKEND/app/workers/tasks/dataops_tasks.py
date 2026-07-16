"""Import / export / reporting Celery tasks (docs/05 S6, docs/02 §33, §36).

The API records a job row and enqueues here; these are thin bodies that open a
session and call the same service methods the HTTP path would (so tests can drive
the logic directly without a broker — the pattern `run_pipeline` uses).

Queues: imports/exports on `ingestion` (CPU: parsing + rendering), the report beat
on `scheduled`.
"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass

from app.core.logging import get_logger

# Register cross-module models so SQLAlchemy resolves relationships in the worker.
from app.modules.auth import models as _auth  # noqa: E402,F401
from app.modules.compliance import models as _compliance  # noqa: E402,F401
from app.modules.dataops import models as _dataops  # noqa: E402,F401
from app.modules.documents import models as _documents  # noqa: E402,F401
from app.modules.equipment import models as _equipment  # noqa: E402,F401
from app.modules.ingestion import models as _ingestion  # noqa: E402,F401
from app.modules.maintenance import models as _maintenance  # noqa: E402,F401
from app.modules.meters import models as _meters  # noqa: E402,F401
from app.modules.tenants import models as _tenants  # noqa: E402,F401
from app.modules.users import models as _users  # noqa: E402,F401
from app.workers.celery_app import celery

log = get_logger("workers.dataops")


@dataclass(frozen=True)
class _Actor:
    """Minimal actor stand-in — services only need `.id` for audit/ownership."""

    id: uuid.UUID


# ── import ────────────────────────────────────────────────────────────────────
async def _run_validate(job_id: str, tenant_id: str) -> dict:
    from app.core.database import SessionFactory
    from app.modules.dataops.import_service import ImportService

    async with SessionFactory() as session:
        job = await ImportService(session, tenant_id).validate(uuid.UUID(job_id))
        await session.commit()
        return {"job_id": job_id, "status": job.status, "total_rows": job.total_rows}


@celery.task(name="app.workers.tasks.dataops_tasks.validate_import")
def validate_import(job_id: str, tenant_id: str) -> dict:
    """Parse the upload → preview + guessed mapping (docs/05 S6)."""
    result = asyncio.run(_run_validate(job_id, tenant_id))
    log.info("import_validated", **result)
    return result


async def _run_apply(job_id: str, tenant_id: str, actor_id: str) -> dict:
    from app.core.database import SessionFactory
    from app.modules.dataops.import_service import ImportService

    async with SessionFactory() as session:
        job = await ImportService(session, tenant_id).run_apply(
            uuid.UUID(job_id), actor=_Actor(uuid.UUID(actor_id)))
        await session.commit()
        return {"job_id": job_id, "status": job.status,
                "ok_rows": job.ok_rows, "error_rows": job.error_rows}


@celery.task(name="app.workers.tasks.dataops_tasks.apply_import")
def apply_import(job_id: str, tenant_id: str, actor_id: str) -> dict:
    """Upsert every row; collect rejects into an error-report CSV (docs/05 S6)."""
    result = asyncio.run(_run_apply(job_id, tenant_id, actor_id))
    log.info("import_apply_done", **result)
    return result


# ── export ────────────────────────────────────────────────────────────────────
async def _run_export(job_id: str, tenant_id: str, actor_id: str) -> dict:
    from app.core.database import SessionFactory
    from app.modules.dataops.export_service import ExportService

    async with SessionFactory() as session:
        job = await ExportService(session, tenant_id).run_job(
            uuid.UUID(job_id), actor_id=uuid.UUID(actor_id))
        await session.commit()
        return {"job_id": job_id, "status": job.status, "row_count": job.row_count}


@celery.task(name="app.workers.tasks.dataops_tasks.render_export")
def render_export(job_id: str, tenant_id: str, actor_id: str) -> dict:
    """Render a >2000-row export off-request → notify with a signed URL."""
    result = asyncio.run(_run_export(job_id, tenant_id, actor_id))
    log.info("export_rendered", **result)
    return result


# ── report schedules (beat) ───────────────────────────────────────────────────
async def _run_report_schedules() -> dict:
    from sqlalchemy import select

    from app.core.database import SessionFactory
    from app.modules.dataops.report_service import ReportService
    from app.modules.tenants.models import Tenant

    ran = 0
    async with SessionFactory() as session:
        tenants = list((await session.execute(
            select(Tenant).where(Tenant.deleted_at.is_(None)))).scalars())
        for tenant in tenants:
            ran += await ReportService(session, tenant.id).run_due_schedules()
        await session.commit()
    return {"reports_run": ran}


@celery.task(name="app.workers.tasks.dataops_tasks.run_report_schedules")
def run_report_schedules() -> dict:
    """Beat: run every due `report_schedules` cron → email `report.ready`.

    Distinct from `scheduler_tasks.run_scheduled_reports`, which drives the
    *analytics* module's own schedules.
    """
    result = asyncio.run(_run_report_schedules())
    log.info("report_schedules_done", **result)
    return result
