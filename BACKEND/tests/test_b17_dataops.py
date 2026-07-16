"""B17 — import / export / reporting engine (docs/05 S6).

Covers the prompt's test list: import validate→apply happy path **and** the
error-report path, the header CSV matching the schema, exports honouring a saved
view's column order + the caller's locale formats, a report run producing a real
PDF, and the cron parser.

The services are driven directly (the routers only enqueue Celery tasks — the
same split `test_ingestion.py` uses for `run_pipeline`), plus a couple of HTTP
tests for the endpoints that render on the request. Needs Postgres + MinIO;
skips cleanly without them.
"""

from __future__ import annotations

import csv
import io
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.core import storage
from app.core.database import SessionFactory
from app.modules.dataops.export_service import ExportService
from app.modules.dataops.import_registry import REGISTRY, get_spec
from app.modules.dataops.import_service import ImportService
from app.modules.dataops.models import ImportJob, ReportSchedule, ReportTemplate
from app.modules.dataops.report_service import ReportService, apply_layout, cron_is_due
from app.modules.equipment.models import Equipment
from app.modules.tenants.models import Tenant
from seeds.seed import DEMO_PASSWORD
from seeds.seed import run as seed_run


@dataclass(frozen=True)
class _Actor:
    id: uuid.UUID
    tenant_id: uuid.UUID


async def _tenant(session) -> Tenant:
    return (await session.execute(
        select(Tenant).where(Tenant.slug == "indusmind"))).scalar_one()


async def _admin(session, tenant) -> _Actor:
    from app.modules.auth.models import User

    user = (await session.execute(select(User).where(
        User.tenant_id == tenant.id, User.email == "admin@indusmind.io"))).scalar_one()
    return _Actor(id=user.id, tenant_id=tenant.id)


def _csv_bytes(headers: list[str], rows: list[list[str]]) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(headers)
    w.writerows(rows)
    return buf.getvalue().encode()


async def _upload(tenant_id, name: str, data: bytes) -> str:
    """Put a file where a presigned upload would have landed."""
    import asyncio

    key = f"tenant/{tenant_id}/imports/{uuid.uuid4().hex}/{name}"
    await asyncio.to_thread(storage.put_object, key, data, "text/csv")
    return key


# ── template CSV is generated from the schema ─────────────────────────────────
async def test_import_template_csv_matches_schema(db):
    """Headers come from the row schema's fields, in declaration order."""
    async with SessionFactory() as session:
        tenant = await _tenant(session) if await _has_tenant(session) else None
        svc = ImportService(session, tenant.id if tenant else uuid.uuid4())
        for entity, spec in REGISTRY.items():
            text = await svc.template_csv(entity)
            headers = next(csv.reader(io.StringIO(text)))
            assert headers == list(spec.row_schema.model_fields.keys()), (
                f"{entity}: template headers drifted from the schema"
            )
            # Every required field is present in the template.
            assert set(spec.required) <= set(headers)


async def _has_tenant(session) -> bool:
    return (await session.execute(
        select(Tenant).where(Tenant.slug == "indusmind"))).scalar_one_or_none() is not None


async def test_import_template_endpoint(db, client):
    await seed_run()
    login = await client.post("/api/v1/auth/login",
                              json={"email": "admin@indusmind.io", "password": DEMO_PASSWORD})
    token = login.json()["data"]["access_token"]
    resp = await client.get("/api/v1/import/templates/equipment",
                            headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200, resp.text
    assert "attachment; filename=equipment.csv" in resp.headers.get("content-disposition", "")
    headers = next(csv.reader(io.StringIO(resp.text)))
    assert headers == get_spec("equipment").fields

    # Unknown entity → 422 from the registry, not a 500.
    bad = await client.get("/api/v1/import/templates/nope",
                           headers={"Authorization": f"Bearer {token}"})
    assert bad.status_code == 422, bad.text


# ── import: validate → preview → apply (happy path + error report) ────────────
async def test_import_validate_and_apply_with_error_report(db, minio):
    """Good rows upsert; bad rows land in a downloadable error-report CSV."""
    await seed_run()
    async with SessionFactory() as session:
        tenant = await _tenant(session)
        actor = await _admin(session, tenant)

        # 2 valid rows + 2 rejects (unknown plant code, missing required name).
        data = _csv_bytes(
            ["tag", "name", "plant_code", "criticality"],
            [
                ["IMP-001", "Imported Pump 1", "JAM", "A"],
                ["IMP-002", "Imported Pump 2", "JAM", "B"],
                ["IMP-003", "Ghost Pump", "NOPLANT", "C"],   # unknown plant_code
                ["IMP-004", "", "JAM", "C"],                 # name fails min_length
            ])
        key = await _upload(tenant.id, "equipment.csv", data)

        svc = ImportService(session, tenant.id)
        job = await svc.create_job(entity="equipment", file_key=key, actor=actor)
        assert job.status == "validating"  # handed to the worker

        # Run the validate task body directly.
        job = await svc.validate(job.id)
        assert job.status == "preview"
        assert job.total_rows == 4
        assert job.mapping["tag"] == "tag"           # header-similarity guess
        assert job.mapping["plant_code"] == "plant_code"
        assert job.preview["fields"] == get_spec("equipment").fields
        assert len(job.preview["sample"]) == 3       # the empty-name row is a preview error
        assert job.preview["preview_errors"], "expected the blank-name row to be flagged"

        # Confirm mapping → apply (enqueues), then run the task body.
        job = await svc.apply(job.id, mapping=None, actor=actor)
        assert job.status == "applying"
        job = await svc.run_apply(job.id, actor=actor)
        await session.commit()

        assert job.status == "done"
        assert job.ok_rows == 2, f"expected 2 good rows, got {job.ok_rows}"
        assert job.error_rows == 2, f"expected 2 rejects, got {job.error_rows}"
        assert job.error_report_key, "no error-report CSV written"

    # The two good rows really exist.
    async with SessionFactory() as session:
        tags = set((await session.execute(select(Equipment.tag).where(
            Equipment.tenant_id == tenant.id,
            Equipment.tag.in_(["IMP-001", "IMP-002", "IMP-003", "IMP-004"])))).scalars())
    assert tags == {"IMP-001", "IMP-002"}

    # The error report is a real CSV naming the rows and reasons.
    import asyncio

    blob = await asyncio.to_thread(storage.read_object, job.error_report_key)
    rows = list(csv.DictReader(io.StringIO(blob.decode())))
    assert len(rows) == 2
    reasons = " ".join(r["error"] for r in rows)
    assert "NOPLANT" in reasons          # resolver's message survives to the report
    assert any("name" in r["error"] for r in rows)   # schema validation message


async def test_import_is_idempotent_on_reapply(db, minio):
    """Re-importing the same tags updates rather than duplicating."""
    await seed_run()
    async with SessionFactory() as session:
        tenant = await _tenant(session)
        actor = await _admin(session, tenant)
        svc = ImportService(session, tenant.id)

        async def _apply(name: str) -> None:
            key = await _upload(tenant.id, "eq.csv", _csv_bytes(
                ["tag", "name", "plant_code"], [["IDEM-1", name, "JAM"]]))
            job = await svc.create_job(entity="equipment", file_key=key, actor=actor)
            await svc.validate(job.id)
            await svc.run_apply(job.id, actor=actor)

        await _apply("First Name")
        await _apply("Second Name")
        await session.commit()

    async with SessionFactory() as session:
        rows = list((await session.execute(select(Equipment).where(
            Equipment.tenant_id == tenant.id, Equipment.tag == "IDEM-1"))).scalars())
    assert len(rows) == 1, "re-import duplicated the row"
    assert rows[0].name == "Second Name", "re-import didn't update the row"


# ── export: column order + locale formatting ──────────────────────────────────
async def test_export_respects_columns_and_locale_format(db):
    """A saved view's column order is honoured and dates use the caller's format."""
    await seed_run()
    async with SessionFactory() as session:
        tenant = await _tenant(session)
        actor = await _admin(session, tenant)

        # The caller's saved view asks for a subset, in a non-default order.
        view_columns = ["status", "tag", "created_at"]
        result = await ExportService(session, tenant.id).export(
            entity="equipment", filters={}, columns=view_columns, fmt="csv", actor=actor)
        assert result["sync"] is True, "seeded equipment should be under the 2000-row threshold"

        rows = list(csv.reader(io.StringIO(result["blob"].decode())))
        assert rows[0] == view_columns, "export ignored the saved view's column order"

        # created_at is rendered through the settings formatter (default
        # 'dd MMM yyyy'), not as a raw ISO timestamp.
        created = rows[1][view_columns.index("created_at")]
        assert "T" not in created and datetime.strptime(created, "%d %b %Y")

        # Flip the user's date format → the export must follow it.
        from app.modules.settings.service import SettingsService

        await SettingsService(session, tenant.id).set_value(
            key="locale.date_format", scope="user", scope_id=actor.id,
            value="yyyy-MM-dd", actor=actor)
        await session.flush()

        result2 = await ExportService(session, tenant.id).export(
            entity="equipment", filters={}, columns=view_columns, fmt="csv", actor=actor)
        rows2 = list(csv.reader(io.StringIO(result2["blob"].decode())))
        created2 = rows2[1][view_columns.index("created_at")]
        assert datetime.strptime(created2, "%Y-%m-%d"), (
            f"export ignored the user's locale.date_format: {created2!r}"
        )


async def test_export_over_threshold_becomes_a_job(db, minio, monkeypatch):
    """Above the sync threshold the request returns a job, not a file."""
    from app.modules.dataops import export_service as export_mod

    await seed_run()
    # Force the async path without generating 2000+ rows.
    monkeypatch.setattr(export_mod, "SYNC_THRESHOLD", 0)

    async with SessionFactory() as session:
        tenant = await _tenant(session)
        actor = await _admin(session, tenant)
        svc = ExportService(session, tenant.id)
        result = await svc.export(entity="equipment", filters={}, columns=["tag", "status"],
                                  fmt="csv", actor=actor)
        assert result["sync"] is False
        assert result["status"] == "pending", "job should be queued, not rendered inline"
        job_id = uuid.UUID(result["job_id"])

        # Run the render_export task body (the worker's job).
        job = await svc.run_job(job_id, actor_id=actor.id)
        await session.commit()

    assert job.status == "done"
    assert job.file_key, "worker did not store the rendered export"
    assert job.row_count > 0

    import asyncio

    blob = await asyncio.to_thread(storage.read_object, job.file_key)
    header = next(csv.reader(io.StringIO(blob.decode())))
    assert header == ["tag", "status"], "async render lost the requested column order"

    # A signed download URL is exposed for the finished job.
    assert storage.presigned_get(job.file_key).startswith("http")


async def test_export_unknown_column_is_dropped_and_xlsx_renders(db):
    await seed_run()
    async with SessionFactory() as session:
        tenant = await _tenant(session)
        actor = await _admin(session, tenant)
        result = await ExportService(session, tenant.id).export(
            entity="equipment", filters={}, columns=["tag", "not_a_column"],
            fmt="xlsx", actor=actor)
    assert result["sync"] is True
    assert result["blob"][:2] == b"PK"  # a real xlsx (zip container)
    assert result["content_type"].endswith("spreadsheetml.sheet")


# ── reports ───────────────────────────────────────────────────────────────────
async def test_report_run_produces_pdf(db, minio):
    """The seeded Daily Plant Summary renders a real PDF and records a run."""
    await seed_run()
    async with SessionFactory() as session:
        tenant = await _tenant(session)
        actor = await _admin(session, tenant)
        template = (await session.execute(select(ReportTemplate).where(
            ReportTemplate.code == "daily_plant_summary"))).scalar_one()

        result = await ReportService(session, tenant.id).run(template.id, actor=actor)
        await session.commit()

    assert result["output"] == "pdf"
    assert result["download_url"]
    import asyncio

    blob = await asyncio.to_thread(storage.read_object, result["storage_key"])
    # WeasyPrint or the ReportLab fallback — either way it must be a real PDF.
    assert blob[:4] == b"%PDF", "report run did not produce a PDF"
    assert len(blob) > 500


async def test_seeded_daily_summary_schedule_is_disabled(db):
    """A fresh install must not email anyone until an admin opts in."""
    await seed_run()
    async with SessionFactory() as session:
        tenant = await _tenant(session)
        schedule = (await session.execute(select(ReportSchedule).where(
            ReportSchedule.tenant_id == tenant.id))).scalar_one()
        assert schedule.is_active is False
        assert schedule.cron_expr == "0 6 * * *"
        # Disabled ⇒ never due, however long it's been.
        svc = ReportService(session, tenant.id)
        assert await svc.due_schedules(now=datetime.now(UTC) + timedelta(days=2)) == []


def test_apply_layout_selects_and_retitles_sections():
    """layout JSONB picks/reorders/retitles what the named query returned."""
    result = {"title": "Builder title", "sections": [
        {"key": "metrics", "heading": "Key metrics", "columns": ["a"], "rows": [[1]]},
        {"key": "open_work_orders", "heading": "Open work orders", "columns": ["b"], "rows": [[2]]},
    ]}
    # No layout → unchanged.
    assert apply_layout(result, {})["sections"] == result["sections"]
    assert apply_layout(result, None)["sections"] == result["sections"]

    laid = apply_layout(result, {"title": "Custom", "sections": [
        {"key": "open_work_orders", "heading": "Backlog"},
        {"key": "nonexistent"},          # unknown keys are ignored, never invented
    ]})
    assert laid["title"] == "Custom"
    assert [s["heading"] for s in laid["sections"]] == ["Backlog"]
    assert laid["sections"][0]["rows"] == [[2]]


# ── cron parser ───────────────────────────────────────────────────────────────
def test_cron_is_due_parser():
    now = datetime(2026, 7, 15, 6, 0, tzinfo=UTC)

    # Daily 06:00 — due when it last ran yesterday, not when it just ran.
    assert cron_is_due("0 6 * * *", last_run=now - timedelta(days=1), now=now) is True
    assert cron_is_due("0 6 * * *", last_run=now, now=now) is False

    # Never run before → due (base is a minute ago, so the 06:00 tick counts).
    assert cron_is_due("* * * * *", last_run=None, now=now) is True

    # Hourly at :30 hasn't come round yet at :00.
    assert cron_is_due("30 * * * *", last_run=now - timedelta(minutes=20), now=now) is False
    assert cron_is_due("30 * * * *", last_run=now - timedelta(hours=2), now=now) is True


def test_invalid_cron_is_rejected():
    from app.core.exceptions import ValidationFailed
    from app.modules.dataops.report_service import _validate_cron

    _validate_cron("0 6 * * *")  # valid → no raise
    with pytest.raises(ValidationFailed):
        _validate_cron("not a cron")


# ── import job lifecycle guards ───────────────────────────────────────────────
async def test_apply_rejects_job_not_in_preview(db, minio):
    await seed_run()
    async with SessionFactory() as session:
        from app.core.exceptions import ConflictError

        tenant = await _tenant(session)
        actor = await _admin(session, tenant)
        key = await _upload(tenant.id, "eq.csv",
                            _csv_bytes(["tag", "name", "plant_code"], [["G-1", "Guard", "JAM"]]))
        svc = ImportService(session, tenant.id)
        job = await svc.create_job(entity="equipment", file_key=key, actor=actor)
        # Still `validating` — the mapping hasn't been previewed/confirmed yet.
        with pytest.raises(ConflictError):
            await svc.apply(job.id, mapping=None, actor=actor)


async def test_unknown_import_entity_is_rejected(db):
    from app.core.exceptions import ValidationFailed

    async with SessionFactory() as session:
        with pytest.raises(ValidationFailed):
            await ImportService(session, uuid.uuid4()).create_job(
                entity="martians", file_key="x", actor=_Actor(uuid.uuid4(), uuid.uuid4()))


async def test_validate_marks_job_failed_on_unreadable_file(db):
    """A bad upload fails the job with a reason instead of exploding the worker."""
    await seed_run()
    async with SessionFactory() as session:
        tenant = await _tenant(session)
        actor = await _admin(session, tenant)
        svc = ImportService(session, tenant.id)
        job = await svc.create_job(entity="equipment", file_key="tenant/missing/nope.csv",
                                   actor=actor)
        job = await svc.validate(job.id)
        assert job.status == "failed"
        assert job.preview.get("error")

        stored = (await session.execute(select(ImportJob).where(
            ImportJob.id == job.id))).scalar_one()
        assert stored.status == "failed"
