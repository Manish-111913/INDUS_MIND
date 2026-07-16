"""Export engine (docs/05 S6).

Small result sets (≤2000 rows) render synchronously and stream back; larger sets
become an `export_jobs` row rendered off-request (Celery) with an
`export.completed` notification carrying a signed URL. Either way values are
formatted through the settings service so an export matches the on-screen view.
"""

from __future__ import annotations

import asyncio
import csv
import io
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.exceptions import NotFound
from app.core.logging import get_logger
from app.modules.audit.service import AuditService
from app.modules.dataops.export_registry import get_spec
from app.modules.dataops.models import ExportJob
from app.modules.settings.format import formatter_for

log = get_logger("dataops.exports")

SYNC_THRESHOLD = 2000


class ExportService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.audit = AuditService(session)

    def _columns(self, spec, requested: list[str] | None) -> list[str]:
        if requested:
            # honour caller order (e.g. a saved view), drop unknown columns.
            return [c for c in requested if c in spec.columns] or spec.columns
        return list(spec.columns)

    async def export(self, *, entity: str, filters: dict, columns: list[str] | None,
                     fmt: str, actor) -> dict:
        spec = get_spec(entity)
        total = await spec.count(self.session, self.tenant_id, filters or {})
        cols = self._columns(spec, columns)
        if total <= SYNC_THRESHOLD:
            blob = await self._render(spec, cols, filters or {}, fmt, actor, entity=entity)
            await self.audit.write(action="export.sync", entity_type="export",
                                   entity_id=None, tenant_id=self.tenant_id, actor_id=actor.id,
                                   after={"entity": entity, "rows": total, "format": fmt})
            return {"sync": True, "row_count": total, "format": fmt,
                    "filename": f"{entity}.{fmt}", "content_type": _content_type(fmt),
                    "blob": blob}
        # Async path: too big to render on the request. Record the job and let the
        # worker render + upload it, then notify with a signed URL (docs/05 S6).
        job = ExportJob(tenant_id=self.tenant_id, entity=entity, filters=filters or {},
                        columns=cols, format=fmt, status="pending",
                        created_by=actor.id, updated_by=actor.id)
        self.session.add(job)
        await self.session.flush()
        await self.audit.write(action="export.enqueue", entity_type="export_job",
                               entity_id=job.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"entity": entity, "rows": total, "format": fmt})
        _enqueue_render(job.id, self.tenant_id, actor.id)
        return {"sync": False, "job_id": str(job.id), "status": job.status,
                "row_count": total}

    async def get(self, job_id: uuid.UUID) -> ExportJob:
        job = (await self.session.execute(select(ExportJob).where(
            ExportJob.id == job_id, ExportJob.tenant_id == self.tenant_id))).scalar_one_or_none()
        if job is None:
            raise NotFound("Export job not found", code="EXPORT_JOB_NOT_FOUND")
        return job

    async def run_job(self, job_id: uuid.UUID, *, actor_id) -> ExportJob:
        """Render + upload + notify (the `render_export` task body)."""
        job = await self.get(job_id)
        spec = get_spec(job.entity)
        job.status = "processing"
        await self.session.flush()
        try:
            blob = await self._render(spec, job.columns, job.filters or {}, job.format, None,
                                      entity=job.entity, user_id=actor_id)
            key = f"tenant/{self.tenant_id}/exports/{job.id}.{job.format}"
            await asyncio.to_thread(storage.put_object, key, blob, _content_type(job.format))
            job.file_key = key
            job.row_count = await spec.count(self.session, self.tenant_id, job.filters or {})
            job.status = "done"
        except Exception as exc:  # noqa: BLE001 — a failed render must mark the job, not vanish
            job.status = "failed"
            await self.session.flush()
            log.warning("export_render_failed", job_id=str(job_id), error=str(exc))
            raise
        await self.session.flush()
        await self._notify_completed(job, actor_id)
        return job

    async def _render(self, spec, cols: list[str], filters: dict, fmt: str, actor,
                      *, entity: str, user_id=None) -> bytes:
        # Values go through the settings formatter so the file matches the
        # on-screen view (dates/numbers/units per the caller's locale — docs/05 S1).
        fmt_engine = await formatter_for(self.session, self.tenant_id,
                                         (actor.id if actor else user_id))
        rows = await spec.fetch(self.session, self.tenant_id, filters)
        table = [[fmt_engine.format_value(r.get(c), spec.kinds.get(c)) for c in cols] for r in rows]
        return _render_bytes(cols, table, fmt, entity_name=entity)

    async def _notify_completed(self, job: ExportJob, actor_id) -> None:
        from app.modules.notifications.service import NotificationRouter

        url = storage.presigned_get(job.file_key) if job.file_key else ""
        await NotificationRouter(self.session, self.tenant_id).deliver(
            user_id=actor_id, category="system", priority="normal",
            title=f"Your {job.entity} export is ready",
            body=f"{job.row_count} rows exported.", entity_type="export", entity_id=job.id,
            channels=["in_app", "email"], event_code="export.completed",
            payload={"entity": job.entity, "row_count": job.row_count, "download_url": url})


# ── queue seam (docs/02 §34: the API publishes, the worker renders) ───────────
def _enqueue_render(job_id: uuid.UUID, tenant_id, actor_id) -> None:
    from app.workers.tasks.dataops_tasks import render_export

    render_export.delay(str(job_id), str(tenant_id), str(actor_id))
    log.info("export_render_enqueued", job_id=str(job_id))


def _render_bytes(columns: list[str], rows: list[list], fmt: str, *, entity_name: str) -> bytes:
    if fmt == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(columns)
        writer.writerows(rows)
        return buf.getvalue().encode()
    # xlsx
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = (entity_name or "Export")[:31]  # Excel caps sheet titles at 31 chars
    ws.append(columns)
    for row in rows:
        ws.append(list(row))
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def _content_type(fmt: str) -> str:
    return "text/csv" if fmt == "csv" else \
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
