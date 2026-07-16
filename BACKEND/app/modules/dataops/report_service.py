"""Report engine (docs/05 S6).

Runs a named-query report template → renders a branded PDF (WeasyPrint; falls
back to a ReportLab layout where WeasyPrint's native libs aren't installed) →
stores it → records a `report_runs` row. Schedules are cron strings the beat
evaluates with croniter; a due run emails the recipients via the S3
`report.ready` template with a signed URL.
"""

from __future__ import annotations

import asyncio
import html as _html
import io
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.exceptions import NotFound, ValidationFailed
from app.core.logging import get_logger
from app.modules.audit.service import AuditService
from app.modules.dataops.models import ReportRun, ReportSchedule, ReportTemplate
from app.modules.dataops.report_registry import get_builder

log = get_logger("dataops.reports")


class ReportService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.audit = AuditService(session)

    # ── templates ─────────────────────────────────────────────────────────────
    async def list_templates(self) -> list[ReportTemplate]:
        stmt = select(ReportTemplate).where(
            ReportTemplate.deleted_at.is_(None),
            (ReportTemplate.tenant_id == self.tenant_id) | (ReportTemplate.tenant_id.is_(None)),
        ).order_by(ReportTemplate.name)
        return list((await self.session.execute(stmt)).scalars().all())

    async def get_template(self, template_id: uuid.UUID) -> ReportTemplate:
        row = (await self.session.execute(select(ReportTemplate).where(
            ReportTemplate.id == template_id, ReportTemplate.deleted_at.is_(None),
            (ReportTemplate.tenant_id == self.tenant_id) | (ReportTemplate.tenant_id.is_(None)),
        ))).scalar_one_or_none()
        if row is None:
            raise NotFound("Report template not found", code="REPORT_TEMPLATE_NOT_FOUND")
        return row

    # ── run ───────────────────────────────────────────────────────────────────
    async def run(self, template_id: uuid.UUID, *, params: dict | None = None, actor=None) -> dict:
        template = await self.get_template(template_id)
        query_name = (template.query_def or {}).get("query")
        if not query_name:
            raise ValidationFailed(f"Report template '{template.code}' has no query",
                                   code="REPORT_QUERY_MISSING", http_status=422)
        builder = get_builder(str(query_name))
        merged = {**(template.query_def or {}).get("params", {}), **(params or {})}
        result = await builder(self.session, self.tenant_id, merged)
        result = apply_layout(result, template.layout)

        if template.output == "xlsx":
            blob, ext = _render_xlsx(result), "xlsx"
        else:
            blob, ext = await asyncio.to_thread(render_pdf, result), "pdf"

        run = ReportRun(tenant_id=self.tenant_id, template_id=template.id, status="done",
                        params=merged, created_by=(actor.id if actor else None),
                        updated_by=(actor.id if actor else None))
        self.session.add(run)
        await self.session.flush()
        key = f"tenant/{self.tenant_id}/reports/{run.id}.{ext}"
        await asyncio.to_thread(storage.put_object, key, blob,
                                "application/pdf" if ext == "pdf" else
                                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        run.file_key = key
        await self.session.flush()
        if actor is not None:
            await self.audit.write(action="report.run", entity_type="report_template",
                                   entity_id=template.id, tenant_id=self.tenant_id,
                                   actor_id=actor.id, after={"run_id": str(run.id)})
        return {"run_id": str(run.id), "template": template.code, "output": ext,
                "storage_key": key, "download_url": storage.presigned_get(key)}

    # ── schedules ─────────────────────────────────────────────────────────────
    async def create_schedule(self, *, template_id: uuid.UUID, cron_expr: str, recipients: list,
                              locale: str, is_active: bool, actor) -> ReportSchedule:
        await self.get_template(template_id)
        _validate_cron(cron_expr)
        row = ReportSchedule(tenant_id=self.tenant_id, template_id=template_id, cron_expr=cron_expr,
                             recipients=recipients, locale=locale, is_active=is_active,
                             created_by=actor.id, updated_by=actor.id)
        self.session.add(row)
        await self.session.flush()
        await self.audit.write(action="report.schedule", entity_type="report_schedule",
                               entity_id=row.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"cron": cron_expr})
        return row

    async def list_schedules(self) -> list[ReportSchedule]:
        return list((await self.session.execute(select(ReportSchedule).where(
            ReportSchedule.tenant_id == self.tenant_id,
            ReportSchedule.deleted_at.is_(None)))).scalars().all())

    async def due_schedules(self, *, now: datetime) -> list[ReportSchedule]:
        """Active schedules whose cron has come round since `last_run_at`."""
        rows = (await self.session.execute(select(ReportSchedule).where(
            ReportSchedule.tenant_id == self.tenant_id,
            ReportSchedule.is_active.is_(True),
            ReportSchedule.deleted_at.is_(None)))).scalars().all()
        return [s for s in rows
                if cron_is_due(s.cron_expr, last_run=s.last_run_at, now=now)]

    async def run_due_schedules(self, *, now: datetime | None = None) -> int:
        """Run every due schedule and email `report.ready` (the beat task body).

        One bad schedule must not stop the rest, so each is guarded; the run is
        stamped on `last_run_at` only after a successful render.
        """
        now = now or datetime.now(UTC)
        ran = 0
        for schedule in await self.due_schedules(now=now):
            try:
                result = await self.run(schedule.template_id, params=None, actor=None)
            except Exception as exc:  # noqa: BLE001 — one report must not stop the beat
                log.warning("report_schedule_failed", schedule_id=str(schedule.id),
                            error=str(exc))
                continue
            schedule.last_run_at = now
            await self.session.flush()
            await self._email_ready(schedule, result)
            ran += 1
        return ran

    async def _email_ready(self, schedule: ReportSchedule, result: dict) -> None:
        """Email each recipient the `report.ready` template with a signed URL.

        Recipients are plain addresses (not necessarily users), so this renders the
        S3 template itself and sends via the logged mailer rather than going through
        NotificationRouter, which routes to user ids.
        """
        from app.modules.notifications import senders, templating
        from app.modules.notifications.repository import TemplateRepository

        template = await self.get_template(schedule.template_id)
        ctx = {"report_name": template.name,
               "download_url": result.get("download_url", ""),
               "run_id": result.get("run_id", "")}
        locale = schedule.locale or "en"
        tpl = await TemplateRepository(self.session, self.tenant_id).resolve(
            "report.ready", "email", locale)
        subject = (templating.render(tpl.subject_tpl, ctx) if tpl else None) \
            or f"{template.name} is ready"
        body = (templating.render(tpl.body_tpl, ctx) if tpl else None) \
            or f"Your scheduled report “{template.name}” is ready: {ctx['download_url']}"

        for recipient in (schedule.recipients or []):
            # send_email_logged already swallows + records mail failures.
            await senders.send_email_logged(
                self.session, self.tenant_id, to_email=recipient, subject=subject,
                body=body, template_id=(tpl.id if tpl else None))


def _validate_cron(expr: str) -> None:
    from croniter import croniter

    from app.core.exceptions import ValidationFailed

    if not croniter.is_valid(expr):
        raise ValidationFailed(f"Invalid cron expression '{expr}'", code="CRON_INVALID",
                               http_status=422)


def cron_is_due(expr: str, *, last_run: datetime | None, now: datetime) -> bool:
    """True if a schedule with `expr` should fire at/after `now` given `last_run`."""
    from croniter import croniter

    base = last_run or (now - _one_minute())
    itr = croniter(expr, base)
    nxt = itr.get_next(datetime)
    if nxt.tzinfo is None:
        nxt = nxt.replace(tzinfo=UTC)
    return nxt <= now


def _one_minute():
    from datetime import timedelta

    return timedelta(minutes=1)


# ── layout ────────────────────────────────────────────────────────────────────
def apply_layout(result: dict, layout: dict | None) -> dict:
    """Project a builder result through the template's `layout` JSONB.

    The named query returns every section it knows how to compute; `layout`
    decides which of them this template shows, in what order, and under what
    heading — so two templates can share one builder and still render
    differently, editable as a DB row rather than a deploy.

        {"title": "...", "sections": [{"key": "metrics", "heading": "KPIs"}, ...]}

    An empty/absent layout renders everything the builder returned, in its order.
    Unknown keys are ignored (a layout can't invent data).
    """
    sections = result.get("sections", [])
    if not layout or not layout.get("sections"):
        return result

    by_key = {s.get("key") or s.get("heading"): s for s in sections}
    picked = []
    for want in layout["sections"]:
        key = want.get("key") if isinstance(want, dict) else want
        section = by_key.get(key)
        if section is None:
            continue
        if isinstance(want, dict) and want.get("heading"):
            section = {**section, "heading": want["heading"]}
        picked.append(section)
    return {**result, "title": layout.get("title") or result.get("title", "Report"),
            "sections": picked or sections}


# ── renderers ─────────────────────────────────────────────────────────────────
def _html_report(result: dict) -> str:
    title = _html.escape(result.get("title", "Report"))
    generated = datetime.now(UTC).strftime("%d %b %Y %H:%M UTC")
    parts = [
        "<html><head><style>",
        "body{font-family:sans-serif;color:#1a1a1a;margin:32px}",
        "header{border-bottom:3px solid #3E7BFA;padding-bottom:8px;margin-bottom:16px}",
        "h1{color:#3E7BFA;font-size:20px;margin:0}",
        "h2{font-size:14px;margin:18px 0 6px}",
        "table{border-collapse:collapse;width:100%;font-size:12px}",
        "th,td{border:1px solid #ddd;padding:5px 8px;text-align:left}",
        "th{background:#f2f6ff}",
        "footer{margin-top:24px;font-size:10px;color:#888;border-top:1px solid #ddd;padding-top:6px}",
        "</style></head><body>",
        f"<header><h1>IndusMind — {title}</h1><div>Generated {generated}</div></header>",
    ]
    for section in result.get("sections", []):
        parts.append(f"<h2>{_html.escape(str(section.get('heading', '')))}</h2>")
        cols = section.get("columns", [])
        parts.append("<table><thead><tr>"
                     + "".join(f"<th>{_html.escape(str(c))}</th>" for c in cols)
                     + "</tr></thead><tbody>")
        for row in section.get("rows", []):
            parts.append("<tr>" + "".join(
                f"<td>{_html.escape(str(v))}</td>" for v in row) + "</tr>")
        parts.append("</tbody></table>")
    parts.append("<footer>IndusMind — AI-Powered Industrial Knowledge Intelligence · "
                 "confidential</footer></body></html>")
    return "".join(parts)


def render_pdf(result: dict) -> bytes:
    """WeasyPrint HTML→PDF; falls back to a ReportLab layout if WeasyPrint's
    native libraries aren't available (e.g. a bare Windows host)."""
    html = _html_report(result)
    try:
        from weasyprint import HTML  # lazy — heavy native deps

        return HTML(string=html).write_pdf()
    except Exception as exc:  # noqa: BLE001 — ImportError / missing libgobject etc.
        log.info("weasyprint_unavailable_fallback_reportlab", error=str(exc))
        return _reportlab_pdf(result)


def _reportlab_pdf(result: dict) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    y = height - 54
    c.setFillColorRGB(0.243, 0.482, 0.980)
    c.setFont("Helvetica-Bold", 15)
    c.drawString(50, y, f"IndusMind — {result.get('title', 'Report')[:70]}")
    c.setFillColorRGB(0, 0, 0)
    y -= 14
    c.setFont("Helvetica", 8)
    c.drawString(50, y, "Generated " + datetime.now(UTC).strftime("%d %b %Y %H:%M UTC"))
    y -= 20
    for section in result.get("sections", []):
        if y < 80:
            c.showPage()
            y = height - 54
        c.setFont("Helvetica-Bold", 11)
        c.drawString(50, y, str(section.get("heading", ""))[:90])
        y -= 14
        c.setFont("Courier", 8)
        cols = section.get("columns", [])
        c.drawString(50, y, " | ".join(str(x)[:18] for x in cols)[:130])
        y -= 12
        for row in section.get("rows", []):
            if y < 60:
                c.showPage()
                y = height - 54
                c.setFont("Courier", 8)
            c.drawString(50, y, " | ".join(str(v)[:18] for v in row)[:130])
            y -= 11
        y -= 8
    c.showPage()
    c.save()
    return buf.getvalue()


def _render_xlsx(result: dict) -> bytes:
    from openpyxl import Workbook

    wb = Workbook()
    first = True
    for section in result.get("sections", []):
        ws = wb.active if first else wb.create_sheet()
        ws.title = str(section.get("heading", "Sheet"))[:31] or "Sheet"
        first = False
        ws.append(list(section.get("columns", [])))
        for row in section.get("rows", []):
            ws.append(list(row))
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()
