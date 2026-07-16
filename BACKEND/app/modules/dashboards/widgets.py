"""Widget data providers (docs/02 §21) — every number is a real query.

Each provider is ``async (session, tenant_id, user_id, params) -> dict`` and is
registered in ``WIDGET_DATA`` by key. The service layer wraps them with Redis
caching (30–60 s). Providers reuse the maintenance metrics SQL and query the
operations tables directly; nothing is hardcoded.
"""

from __future__ import annotations

from sqlalchemy import func, select, text

from app.modules.ai.models import AIInsight, AIUsage
from app.modules.compliance.models import Audit, ComplianceGap, Regulation, RegulationClause
from app.modules.documents.models import Document, IngestionJob
from app.modules.equipment.models import Area, Equipment
from app.modules.maintenance.models import FailureRecord, Prediction, WorkOrder
from app.modules.maintenance.repository import MetricsRepository


def _status(value: float, *, warn: float, crit: float, higher_is_better: bool = True) -> str:
    if higher_is_better:
        if value >= warn:
            return "ok"
        return "warn" if value >= crit else "critical"
    if value <= warn:
        return "ok"
    return "warn" if value <= crit else "critical"


async def _count(session, model, tenant_id, *conds) -> int:
    stmt = select(func.count()).select_from(model).where(model.tenant_id == tenant_id)
    if hasattr(model, "deleted_at"):
        stmt = stmt.where(model.deleted_at.is_(None))
    for c in conds:
        stmt = stmt.where(c)
    return (await session.execute(stmt)).scalar() or 0


# ── KPIs ──────────────────────────────────────────────────────────────────────
async def kpi_oee(session, tenant_id, user_id, params) -> dict:
    avg_health = (await session.execute(select(func.avg(Equipment.health_score)).where(
        Equipment.tenant_id == tenant_id, Equipment.deleted_at.is_(None)))).scalar()
    value = round(float(avg_health), 1) if avg_health is not None else 0.0
    return {"value": value, "unit": "%", "label": "Overall Equipment Effectiveness",
            "sublabel": "health-weighted proxy", "status": _status(value, warn=80, crit=65)}


async def kpi_unplanned_downtime(session, tenant_id, user_id, params) -> dict:
    minutes = (await session.execute(select(func.coalesce(func.sum(FailureRecord.downtime_minutes), 0))
        .where(FailureRecord.tenant_id == tenant_id, FailureRecord.deleted_at.is_(None),
               FailureRecord.occurred_at >= text("now() - interval '90 days'")))).scalar()
    hours = round((minutes or 0) / 60.0, 1)
    return {"value": hours, "unit": "hrs", "label": "Unplanned Downtime (90d)",
            "status": _status(hours, warn=24, crit=60, higher_is_better=False)}


async def kpi_wo_backlog(session, tenant_id, user_id, params) -> dict:
    m = await MetricsRepository(session, tenant_id).compute()
    return {"value": m["open_work_orders"], "unit": "WOs", "label": "Active Work Order Backlog",
            "sublabel": f"{m['backlog_hours']} backlog hrs · {m['overdue_work_orders']} overdue",
            "status": _status(m["overdue_work_orders"], warn=3, crit=8, higher_is_better=False)}


async def kpi_compliance_score(session, tenant_id, user_id, params) -> dict:
    total_clauses = await _count(session, RegulationClause, tenant_id)
    open_gaps = await _count(session, ComplianceGap, tenant_id,
                             ComplianceGap.status.notin_(("resolved", "accepted_risk")))
    score = round(100.0 * max(total_clauses - open_gaps, 0) / total_clauses, 1) if total_clauses else 100.0
    return {"value": score, "unit": "%", "label": "Compliance Score",
            "sublabel": f"{open_gaps} open gap(s)", "status": _status(score, warn=95, crit=85)}


async def kpi_mtbf(session, tenant_id, user_id, params) -> dict:
    m = await MetricsRepository(session, tenant_id).compute()
    return {"value": m["mtbf_hours"], "unit": "hrs", "label": "Mean Time Between Failure",
            "status": "ok" if (m["mtbf_hours"] or 0) else "warn"}


async def kpi_mttr(session, tenant_id, user_id, params) -> dict:
    m = await MetricsRepository(session, tenant_id).compute()
    return {"value": m["mttr_hours"], "unit": "hrs", "label": "Mean Time To Repair",
            "status": _status(m["mttr_hours"] or 0, warn=4, crit=8, higher_is_better=False)}


async def kpi_active_work_orders(session, tenant_id, user_id, params) -> dict:
    n = await _count(session, WorkOrder, tenant_id,
                     WorkOrder.status.notin_(("closed", "cancelled")))
    high = await _count(session, WorkOrder, tenant_id,
                        WorkOrder.status.notin_(("closed", "cancelled")),
                        WorkOrder.priority.in_(("critical", "high")))
    return {"value": n, "unit": "WOs", "label": "Active Work Orders",
            "sublabel": f"{high} high priority open", "status": "warn" if high else "ok"}


async def kpi_registered_regulations(session, tenant_id, user_id, params) -> dict:
    regs = await _count(session, Regulation, tenant_id)
    clauses = await _count(session, RegulationClause, tenant_id)
    return {"value": regs, "unit": "sets", "label": "Registered Regulations",
            "sublabel": f"{clauses} clauses governing", "status": "ok"}


async def kpi_active_gaps(session, tenant_id, user_id, params) -> dict:
    n = await _count(session, ComplianceGap, tenant_id,
                     ComplianceGap.status.notin_(("resolved", "accepted_risk")))
    high = await _count(session, ComplianceGap, tenant_id,
                        ComplianceGap.status.notin_(("resolved", "accepted_risk")),
                        ComplianceGap.severity.in_(("critical", "high")))
    return {"value": n, "unit": "gaps", "label": "Active Procedural Gaps",
            "sublabel": f"{high} high-risk", "status": _status(n, warn=1, crit=4, higher_is_better=False)}


async def kpi_audits_pending(session, tenant_id, user_id, params) -> dict:
    n = await _count(session, Audit, tenant_id, Audit.status.in_(("planned", "in_progress")))
    return {"value": n, "unit": "due", "label": "Audits Pending", "status": "warn" if n else "ok"}


async def kpi_documents_ingested(session, tenant_id, user_id, params) -> dict:
    n = await _count(session, Document, tenant_id, Document.ingestion_status == "completed")
    return {"value": n, "unit": "files", "label": "Documents Ingested", "status": "ok"}


async def kpi_ai_pipeline_success(session, tenant_id, user_id, params) -> dict:
    total = await _count(session, IngestionJob, tenant_id)
    ok = await _count(session, IngestionJob, tenant_id, IngestionJob.status == "completed")
    pct = round(100.0 * ok / total, 1) if total else 100.0
    return {"value": pct, "unit": "%", "label": "AI Pipeline Success",
            "sublabel": f"{ok}/{total} jobs", "status": _status(pct, warn=95, crit=80)}


async def kpi_my_open_wos(session, tenant_id, user_id, params) -> dict:
    n = await _count(session, WorkOrder, tenant_id, WorkOrder.assignee_id == user_id,
                     WorkOrder.status.notin_(("closed", "cancelled")))
    return {"value": n, "unit": "WOs", "label": "My Open Work Orders", "status": "ok"}


async def kpi_hours_logged(session, tenant_id, user_id, params) -> dict:
    total = (await session.execute(select(func.coalesce(func.sum(WorkOrder.labor_hours), 0)).where(
        WorkOrder.tenant_id == tenant_id, WorkOrder.deleted_at.is_(None),
        WorkOrder.assignee_id == user_id, WorkOrder.status == "closed"))).scalar()
    return {"value": round(float(total or 0), 1), "unit": "hrs", "label": "Hours Logged",
            "status": "ok"}


# ── charts ──────────────────────────────────────────────────────────────────
async def chart_downtime_trend(session, tenant_id, user_id, params) -> dict:
    rows = (await session.execute(text(
        """
        SELECT to_char(date_trunc('month', occurred_at), 'YYYY-MM') AS month,
               ROUND(COALESCE(SUM(downtime_minutes), 0) / 60.0, 1) AS hours
        FROM failure_records
        WHERE tenant_id = :t AND deleted_at IS NULL
          AND occurred_at >= now() - interval '12 months'
        GROUP BY 1 ORDER BY 1
        """), {"t": str(tenant_id)})).all()
    return {"type": "line", "x_label": "Month", "y_label": "Downtime (hrs)",
            "series": [{"x": r.month, "y": float(r.hours)} for r in rows]}


async def chart_failure_pareto(session, tenant_id, user_id, params) -> dict:
    from app.modules.lookups.service import LookupService

    labels = {r.id: r.label for r in await LookupService(session, tenant_id).by_category("failure_modes")}
    rows = (await session.execute(select(FailureRecord.failure_mode_id, func.count().label("n"))
        .where(FailureRecord.tenant_id == tenant_id, FailureRecord.deleted_at.is_(None))
        .group_by(FailureRecord.failure_mode_id).order_by(func.count().desc()))).all()
    return {"type": "bar", "x_label": "Failure mode", "y_label": "Count",
            "series": [{"x": labels.get(r[0], "Unclassified"), "y": r[1]} for r in rows]}


async def chart_gap_trend(session, tenant_id, user_id, params) -> dict:
    rows = (await session.execute(select(ComplianceGap.status, func.count().label("n"))
        .where(ComplianceGap.tenant_id == tenant_id, ComplianceGap.deleted_at.is_(None))
        .group_by(ComplianceGap.status))).all()
    return {"type": "bar", "x_label": "Status", "y_label": "Gaps",
            "series": [{"x": r[0], "y": r[1]} for r in rows]}


async def chart_ingestion_throughput(session, tenant_id, user_id, params) -> dict:
    rows = (await session.execute(text(
        """
        SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*) AS n
        FROM ingestion_jobs WHERE tenant_id = :t AND created_at >= now() - interval '14 days'
        GROUP BY 1 ORDER BY 1
        """), {"t": str(tenant_id)})).all()
    return {"type": "line", "x_label": "Day", "y_label": "Jobs",
            "series": [{"x": r.day, "y": r.n} for r in rows]}


async def chart_llm_spend(session, tenant_id, user_id, params) -> dict:
    tokens = AIUsage.prompt_tokens + AIUsage.completion_tokens
    rows = (await session.execute(select(
        AIUsage.feature, func.sum(tokens).label("tokens"),
        func.sum(AIUsage.cost_usd).label("cost"), func.count().label("calls"))
        .where(AIUsage.tenant_id == tenant_id)
        .group_by(AIUsage.feature).order_by(func.sum(tokens).desc()))).all()
    total_tokens = sum(int(r.tokens or 0) for r in rows)
    total_cost = round(sum(float(r.cost or 0) for r in rows), 4)
    return {"type": "bar", "x_label": "Feature", "y_label": "Tokens",
            "total_tokens": total_tokens, "est_cost_usd": total_cost,
            "series": [{"x": r.feature, "y": int(r.tokens or 0), "calls": r.calls,
                        "cost_usd": round(float(r.cost or 0), 4)} for r in rows]}


async def chart_area_health(session, tenant_id, user_id, params) -> dict:
    rows = (await session.execute(select(
        Area.name, func.avg(Equipment.health_score).label("health"),
        func.count(Equipment.id).label("n"))
        .join(Equipment, Equipment.area_id == Area.id)
        .where(Area.tenant_id == tenant_id, Area.deleted_at.is_(None),
               Equipment.deleted_at.is_(None))
        .group_by(Area.name).order_by(func.avg(Equipment.health_score)))).all()
    return {"type": "heatmap", "series": [
        {"area": r.name, "health": round(float(r.health), 1) if r.health is not None else None,
         "equipment": r.n} for r in rows]}


# ── lists / tables ────────────────────────────────────────────────────────────
async def list_ai_brief(session, tenant_id, user_id, params) -> dict:
    role = params.get("role")
    stmt = select(AIInsight).where(AIInsight.tenant_id == tenant_id, AIInsight.deleted_at.is_(None),
                                   AIInsight.active.is_(True))
    if role:
        stmt = stmt.where((AIInsight.role == role) | (AIInsight.role.is_(None)))
    stmt = stmt.order_by(AIInsight.confidence.desc().nulls_last()).limit(5)
    rows = (await session.execute(stmt)).scalars().all()
    return {"type": "list", "items": [
        {"id": str(i.id), "category": i.category, "title": i.title, "body": i.body,
         "confidence": float(i.confidence) if i.confidence is not None else None} for i in rows]}


async def table_my_tasks(session, tenant_id, user_id, params) -> dict:
    rows = (await session.execute(select(WorkOrder).where(
        WorkOrder.tenant_id == tenant_id, WorkOrder.deleted_at.is_(None),
        WorkOrder.assignee_id == user_id, WorkOrder.status.notin_(("closed", "cancelled")))
        .order_by(WorkOrder.due_at.asc().nulls_last()).limit(10))).scalars().all()
    return {"type": "table", "columns": ["wo_number", "title", "priority", "status", "due_at"],
            "rows": [{"wo_number": w.wo_number, "title": w.title, "priority": w.priority,
                      "status": w.status, "due_at": w.due_at.isoformat() if w.due_at else None}
                     for w in rows]}


async def list_predictions(session, tenant_id, user_id, params) -> dict:
    rows = (await session.execute(select(Prediction).where(
        Prediction.tenant_id == tenant_id, Prediction.deleted_at.is_(None),
        Prediction.status == "open").order_by(Prediction.risk_score.desc()).limit(5))).scalars().all()
    return {"type": "list", "items": [
        {"id": str(p.id), "equipment_id": str(p.equipment_id) if p.equipment_id else None,
         "risk_score": float(p.risk_score), "risk_band": p.risk_band,
         "recommendation": p.recommendation} for p in rows]}


async def list_compliance_gaps(session, tenant_id, user_id, params) -> dict:
    rows = (await session.execute(select(ComplianceGap).where(
        ComplianceGap.tenant_id == tenant_id, ComplianceGap.deleted_at.is_(None),
        ComplianceGap.status.notin_(("resolved", "accepted_risk")))
        .order_by(ComplianceGap.created_at.desc()).limit(5))).scalars().all()
    return {"type": "list", "items": [
        {"id": str(g.id), "title": g.title, "severity": g.severity,
         "explanation": g.ai_explanation} for g in rows]}


WIDGET_DATA: dict = {
    "kpi.oee": kpi_oee,
    "kpi.unplanned_downtime": kpi_unplanned_downtime,
    "kpi.wo_backlog": kpi_wo_backlog,
    "kpi.compliance_score": kpi_compliance_score,
    "kpi.mtbf": kpi_mtbf,
    "kpi.mttr": kpi_mttr,
    "kpi.active_work_orders": kpi_active_work_orders,
    "kpi.registered_regulations": kpi_registered_regulations,
    "kpi.active_gaps": kpi_active_gaps,
    "kpi.audits_pending": kpi_audits_pending,
    "kpi.documents_ingested": kpi_documents_ingested,
    "kpi.ai_pipeline_success": kpi_ai_pipeline_success,
    "kpi.my_open_wos": kpi_my_open_wos,
    "kpi.hours_logged": kpi_hours_logged,
    "chart.downtime_trend": chart_downtime_trend,
    "chart.failure_pareto": chart_failure_pareto,
    "chart.gap_trend": chart_gap_trend,
    "chart.ingestion_throughput": chart_ingestion_throughput,
    "chart.llm_spend": chart_llm_spend,
    "chart.area_health": chart_area_health,
    "list.ai_brief": list_ai_brief,
    "table.my_tasks": table_my_tasks,
    "list.predictions": list_predictions,
    "list.compliance_gaps": list_compliance_gaps,
}
