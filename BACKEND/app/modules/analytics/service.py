"""Analytics service (docs/02 §22).

Runs config-driven report definitions safely: SELECT-only whitelist, named bind
params (never string interpolation), `:tenant` always injected so a report can
only ever see its own tenant's rows. Export renders xlsx/csv/pdf to S3; schedules
persist a cron the beat consumes.
"""

from __future__ import annotations

import io
import re
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.exceptions import NotFound, PermissionDenied, ValidationFailed
from app.core.logging import get_logger
from app.modules.analytics.models import ReportDefinition, ScheduledReport
from app.modules.analytics.repository import ReportRepository, ScheduleRepository
from app.modules.audit.service import AuditService

log = get_logger("analytics.service")

_FORBIDDEN = re.compile(r"\b(insert|update|delete|drop|alter|truncate|grant|create|copy)\b", re.I)


def _validate_sql(sql: str) -> None:
    stripped = sql.strip().lower()
    if not (stripped.startswith("select") or stripped.startswith("with")):
        raise ValidationFailed("Report SQL must be a SELECT", code="REPORT_SQL_INVALID",
                               http_status=422)
    if ";" in sql or _FORBIDDEN.search(sql):
        raise ValidationFailed("Report SQL contains disallowed tokens", code="REPORT_SQL_INVALID",
                               http_status=422)


def _coerce(value, type_: str):
    if value is None:
        return None
    try:
        if type_ == "int":
            return int(value)
        if type_ == "float":
            return float(value)
        if type_ == "date":
            return date.fromisoformat(str(value))
        if type_ == "uuid":
            return str(uuid.UUID(str(value)))
    except (ValueError, TypeError) as exc:
        raise ValidationFailed(f"Invalid value for '{value}'", code="VALIDATION_ERROR",
                               http_status=422) from exc
    return str(value)


def _jsonable(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    return value


class AnalyticsService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = ReportRepository(session, tenant_id)
        self.schedules = ScheduleRepository(session, tenant_id)
        self.audit = AuditService(session)

    async def list_reports(self) -> list[ReportDefinition]:
        return await self.repo.list_all()

    async def _get(self, report_id, actor) -> ReportDefinition:
        report = await self.repo.get(report_id)
        if report is None:
            raise NotFound("Report not found", code="REPORT_NOT_FOUND")
        if report.required_permission and actor is not None \
                and report.required_permission not in actor.perms:
            raise PermissionDenied(f"Missing permission: {report.required_permission}")
        return report

    def _bind(self, report: ReportDefinition, user_params: dict) -> dict:
        bound = {"tenant": str(self.tenant_id)}
        for spec in report.params_schema or []:
            name = spec["name"]
            raw = user_params.get(name, spec.get("default"))
            bound[name] = _coerce(raw, spec.get("type", "str"))
        return bound

    async def run(self, report_id, *, params: dict, actor=None) -> dict:
        report = await self._get(report_id, actor)
        _validate_sql(report.sql_template)
        bound = self._bind(report, params or {})
        result = await self.session.execute(text(report.sql_template), bound)
        columns = list(result.keys())
        rows = [{c: _jsonable(v) for c, v in zip(columns, row, strict=False)}
                for row in result.all()]
        return {"report": {"id": str(report.id), "key": report.key, "name": report.name},
                "columns": columns, "rows": rows, "row_count": len(rows),
                "charts": report.chart_config or {}, "params": bound}

    async def export(self, report_id, *, fmt: str, params: dict, actor) -> dict:
        result = await self.run(report_id, params=params, actor=actor)
        blob, content_type, ext = _render(result, fmt)
        key = f"tenant/{self.tenant_id}/exports/{uuid.uuid4()}.{ext}"
        import asyncio

        await asyncio.to_thread(storage.put_object, key, blob, content_type)
        await self.audit.write(action="analytics.export", entity_type="report_definition",
                               entity_id=report_id, tenant_id=self.tenant_id,
                               actor_id=actor.id if actor else None, after={"format": fmt})
        return {"format": fmt, "row_count": result["row_count"], "storage_key": key,
                "download_url": storage.presigned_get(key)}

    async def schedule(self, report_id, *, cron: str, recipients: list, params: dict,
                       fmt: str, actor) -> ScheduledReport:
        await self._get(report_id, actor)
        sched = await self.schedules.add(ScheduledReport(
            report_id=_uuid(report_id), cron=cron, recipients=recipients, params=params,
            format=fmt, active=True, created_by=actor.id, updated_by=actor.id))
        await self.audit.write(action="analytics.schedule", entity_type="scheduled_report",
                               entity_id=sched.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"cron": cron, "recipients": len(recipients)})
        return sched

    async def kpis(self, keys: list[str], actor) -> dict:
        from app.modules.dashboards.widgets import WIDGET_DATA

        out: dict = {}
        for key in keys:
            provider = WIDGET_DATA.get(f"kpi.{key}") or WIDGET_DATA.get(key)
            if provider is None:
                continue
            out[key] = await provider(self.session, self.tenant_id, actor.id, {})
        return out


def _render(result: dict, fmt: str) -> tuple[bytes, str, str]:
    columns, rows = result["columns"], result["rows"]
    if fmt == "csv":
        import csv

        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
        return buf.getvalue().encode(), "text/csv", "csv"
    if fmt == "pdf":
        return _render_pdf(result), "application/pdf", "pdf"
    return _render_xlsx(result), \
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"


def _render_xlsx(result: dict) -> bytes:
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = result["report"]["name"][:31] or "Report"
    ws.append(result["columns"])
    for row in result["rows"]:
        ws.append([row.get(c) for c in result["columns"]])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _render_pdf(result: dict) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    y = height - 60
    c.setFont("Helvetica-Bold", 14)
    c.drawString(50, y, result["report"]["name"][:90])
    y -= 24
    c.setFont("Courier", 8)
    header = " | ".join(str(col)[:16] for col in result["columns"])
    c.drawString(50, y, header[:130])
    y -= 12
    for row in result["rows"][:60]:
        if y < 60:
            c.showPage()
            c.setFont("Courier", 8)
            y = height - 60
        line = " | ".join(str(row.get(col, ""))[:16] for col in result["columns"])
        c.drawString(50, y, line[:130])
        y -= 12
    c.showPage()
    c.save()
    return buf.getvalue()


def _uuid(value) -> uuid.UUID:
    return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
