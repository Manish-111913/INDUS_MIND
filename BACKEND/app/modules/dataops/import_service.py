"""Import engine (docs/05 S6).

Flow: create a job from a presigned-uploaded file → validate + preview (first 20
rows, auto-guessed column mapping) → confirm mapping → apply (upserts in batches,
error rows collected to a downloadable error-report CSV). Validation and apply are
plain async methods so the HTTP path and the Celery tasks (`workers/tasks/
dataops_tasks.py`) share one implementation — the routers enqueue, tests call the
method directly.

Each row goes through the registry's three steps (see `import_registry`):
row_schema (CSV shape) → resolve (codes → FKs) → entity_schema (the module's real
create-schema) → upsert. Every row runs inside its own SAVEPOINT: a row that
raises mid-INSERT rolls back alone instead of poisoning the transaction and
taking every later row down with it, which is what makes the error report exact.
The session is flushed once per BATCH_SIZE rows rather than per row.
"""

from __future__ import annotations

import asyncio
import csv
import io
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.exceptions import ConflictError, NotFound
from app.core.logging import get_logger
from app.modules.audit.service import AuditService
from app.modules.dataops.import_registry import get_spec
from app.modules.dataops.models import ImportJob
from app.modules.dataops.parsing import guess_mapping, parse_table

log = get_logger("dataops.imports")

BATCH_SIZE = 500
PREVIEW_ROWS = 20


class ImportService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.audit = AuditService(session)

    async def template_csv(self, entity: str) -> str:
        """Header-only CSV generated from the schema fields at request time."""
        spec = get_spec(entity)
        buf = io.StringIO()
        csv.writer(buf).writerow(spec.fields)
        return buf.getvalue()

    async def create_job(self, *, entity: str, file_key: str, actor) -> ImportJob:
        """Record the job and hand validation to the worker (docs/05 S6).

        Returns immediately with status `validating`; the client polls
        GET /import/jobs/{id} until it reaches `preview`.
        """
        get_spec(entity)  # unknown entity → 422 before we persist anything
        job = ImportJob(
            tenant_id=self.tenant_id, entity=entity, file_key=file_key, status="validating",
            mapping={}, preview={}, created_by=actor.id, updated_by=actor.id)
        self.session.add(job)
        await self.session.flush()
        await self.audit.write(action="import.create", entity_type="import_job",
                               entity_id=job.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"entity": entity, "file_key": file_key})
        _enqueue_validate(job.id, self.tenant_id)
        return job

    async def validate(self, job_id: uuid.UUID) -> ImportJob:
        """Parse + preview the file (the `validate_import` task body)."""
        job = await self.get(job_id)
        spec = get_spec(job.entity)
        try:
            data = await asyncio.to_thread(storage.read_object, job.file_key)
            headers, rows = parse_table(data)
        except Exception as exc:  # noqa: BLE001 — unreadable/undecodable upload
            job.status = "failed"
            job.preview = {"error": _msg(exc)}
            await self.session.flush()
            log.warning("import_validate_failed", job_id=str(job_id), error=_msg(exc))
            return job

        mapping = guess_mapping(headers, spec.fields)
        sample, errors = [], []
        for i, raw in enumerate(rows[:PREVIEW_ROWS]):
            mapped = _map_row(headers, raw, mapping)
            try:
                # Preview validates the CSV shape only — resolving FKs for every
                # previewed row would make the wizard's first step do real DB work.
                spec.row_schema(**mapped)
                sample.append(mapped)
            except Exception as exc:  # noqa: BLE001 — collected as a preview error
                errors.append({"row": i + 1, "error": _msg(exc)})

        job.mapping = mapping
        job.total_rows = len(rows)
        job.preview = {"headers": headers, "mapping": mapping, "fields": spec.fields,
                       "required": spec.required, "sample": sample,
                       "preview_errors": errors}
        job.status = "preview"
        await self.session.flush()
        return job

    async def get(self, job_id: uuid.UUID) -> ImportJob:
        job = (await self.session.execute(select(ImportJob).where(
            ImportJob.id == job_id, ImportJob.tenant_id == self.tenant_id))).scalar_one_or_none()
        if job is None:
            raise NotFound("Import job not found", code="IMPORT_JOB_NOT_FOUND")
        return job

    async def apply(self, job_id: uuid.UUID, *, mapping: dict | None, actor) -> ImportJob:
        """Confirm the mapping and hand the apply to the worker (docs/05 S6).

        Returns immediately with status `applying`; the client polls
        GET /import/jobs/{id} until `done` (then downloads the error report if any).
        """
        job = await self.get(job_id)
        if job.status not in ("preview", "failed"):
            raise ConflictError(f"Import job already {job.status}", code="IMPORT_NOT_PREVIEW")
        if mapping:
            job.mapping = mapping
        job.status = "applying"
        await self.session.flush()
        await self.audit.write(action="import.apply", entity_type="import_job",
                               entity_id=job.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"mapping": job.mapping})
        _enqueue_apply(job.id, self.tenant_id, actor.id)
        return job

    async def run_apply(self, job_id: uuid.UUID, *, actor) -> ImportJob:
        """Upsert every row (the `apply_import` task body)."""
        job = await self.get(job_id)
        spec = get_spec(job.entity)
        data = await asyncio.to_thread(storage.read_object, job.file_key)
        headers, rows = parse_table(data)
        ok, errors = 0, []
        for i, raw in enumerate(rows):
            mapped = _map_row(headers, raw, job.mapping)
            try:
                # SAVEPOINT per row: a row that fails inside the DB (constraint
                # violation, bad FK) rolls back on its own. Without this a single
                # bad row aborts the transaction and every subsequent row fails.
                async with self.session.begin_nested():
                    row = spec.row_schema(**mapped)                       # CSV shape
                    payload, extras = await spec.resolve(                 # codes → FKs
                        self.session, self.tenant_id, row)
                    validated = spec.entity_schema(**payload)             # real entity rules
                    await spec.upsert(self.session, self.tenant_id, validated, extras, actor)
                ok += 1
            except Exception as exc:  # noqa: BLE001 — row-level error, collected not raised
                errors.append({"row": i + 1, "error": _msg(exc), **mapped})
            if (i + 1) % BATCH_SIZE == 0:
                await self.session.flush()
        await self.session.flush()

        job.ok_rows, job.error_rows, job.total_rows = ok, len(errors), len(rows)
        job.status = "done"
        if errors:
            job.error_report_key = await self._write_error_report(job, errors)
        await self.session.flush()
        log.info("import_applied", job_id=str(job.id), entity=job.entity,
                 ok=ok, errors=len(errors))
        return job

    async def _write_error_report(self, job: ImportJob, errors: list[dict]) -> str:
        buf = io.StringIO()
        cols = ["row", "error"] + list(get_spec(job.entity).fields)
        writer = csv.DictWriter(buf, fieldnames=cols, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(errors)
        key = f"tenant/{self.tenant_id}/imports/{job.id}/errors.csv"
        await asyncio.to_thread(storage.put_object, key, buf.getvalue().encode(), "text/csv")
        return key


# ── queue seam (docs/02 §34: the API publishes, the worker runs) ──────────────
def _enqueue_validate(job_id: uuid.UUID, tenant_id) -> None:
    from app.workers.tasks.dataops_tasks import validate_import

    validate_import.delay(str(job_id), str(tenant_id))
    log.info("import_validate_enqueued", job_id=str(job_id))


def _enqueue_apply(job_id: uuid.UUID, tenant_id, actor_id) -> None:
    from app.workers.tasks.dataops_tasks import apply_import

    apply_import.delay(str(job_id), str(tenant_id), str(actor_id))
    log.info("import_apply_enqueued", job_id=str(job_id))


def _map_row(headers: list[str], raw: list[str], mapping: dict[str, str]) -> dict:
    """Project a raw row into {field: value} via the field→header mapping."""
    by_header = {h: (raw[i] if i < len(raw) else "") for i, h in enumerate(headers)}
    out = {}
    for field, header in mapping.items():
        val = by_header.get(header, "")
        if val != "":
            out[field] = val
    return out


def _msg(exc: Exception) -> str:
    from pydantic import ValidationError

    if isinstance(exc, ValidationError):
        return "; ".join(f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}"
                         for e in exc.errors()[:4])
    return str(exc)
