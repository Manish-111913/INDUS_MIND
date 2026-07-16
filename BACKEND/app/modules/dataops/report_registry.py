"""Named report-query registry (docs/05 S6).

`report_templates.query_def` references a builder BY NAME here — the DB never
stores raw SQL. Each builder returns a structured result (title + sections) the
renderer turns into a PDF/XLSX. Adding a report = one builder + a template row.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession


async def daily_plant_summary(session: AsyncSession, tenant_id, params: dict) -> dict:
    from app.modules.compliance.models import ComplianceGap
    from app.modules.documents.models import Document
    from app.modules.maintenance.models import FailureRecord, WorkOrder

    since = datetime.now(UTC) - timedelta(days=int(params.get("window_days", 7) or 7))

    open_wo = (await session.execute(select(func.count()).select_from(WorkOrder).where(
        WorkOrder.tenant_id == tenant_id, WorkOrder.deleted_at.is_(None),
        WorkOrder.status.in_(["open", "in_progress", "on_hold", "review"])))).scalar() or 0
    new_failures = (await session.execute(select(func.count()).select_from(FailureRecord).where(
        FailureRecord.tenant_id == tenant_id, FailureRecord.deleted_at.is_(None),
        FailureRecord.occurred_at >= since))).scalar() or 0
    docs_done = (await session.execute(select(func.count()).select_from(Document).where(
        Document.tenant_id == tenant_id, Document.deleted_at.is_(None),
        Document.ingestion_status == "completed"))).scalar() or 0
    open_gaps = (await session.execute(select(func.count()).select_from(ComplianceGap).where(
        ComplianceGap.tenant_id == tenant_id, ComplianceGap.deleted_at.is_(None),
        ComplianceGap.status.notin_(["resolved", "accepted_risk"])))).scalar() or 0

    top_wo = (await session.execute(select(WorkOrder).where(
        WorkOrder.tenant_id == tenant_id, WorkOrder.deleted_at.is_(None),
        WorkOrder.status.in_(["open", "in_progress", "on_hold", "review"]))
        .order_by(WorkOrder.due_at).limit(20))).scalars().all()

    # `key` lets a template's `layout` JSONB pick/reorder/retitle sections
    # (see report_service.apply_layout) without touching this builder.
    return {
        "title": "Daily Plant Summary",
        "sections": [
            {"key": "metrics", "heading": "Key metrics", "columns": ["Metric", "Value"], "rows": [
                ["Open work orders", open_wo],
                [f"New failures (last {int(params.get('window_days', 7) or 7)}d)", new_failures],
                ["Documents ingested", docs_done],
                ["Open compliance gaps", open_gaps],
            ]},
            {"key": "open_work_orders", "heading": "Open work orders",
             "columns": ["WO", "Title", "Priority", "Status"],
             "rows": [[w.wo_number, (w.title or "")[:60], w.priority, w.status] for w in top_wo]},
        ],
    }


NAMED_QUERIES: dict[str, Callable[..., Any]] = {
    "daily_plant_summary": daily_plant_summary,
}


def get_builder(name: str):
    builder = NAMED_QUERIES.get(name)
    if builder is None:
        from app.core.exceptions import ValidationFailed

        raise ValidationFailed(f"Unknown report query '{name}'", code="REPORT_QUERY_UNKNOWN",
                               http_status=422)
    return builder
