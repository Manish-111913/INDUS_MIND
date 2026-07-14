"""Scheduler Celery tasks (docs/02 §33, §36).

Beat-driven jobs whose schedule definitions live in code here (the DB `schedules`
table stays the editable source for domain PM schedules; these are the system
beat entries that *read* it). `pm_due_checker` runs hourly: for every tenant it
turns due maintenance_schedules into work orders (source=schedule) and emits a
notification event per created WO. Runs on the `scheduled` queue.
"""

from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.core.logging import get_logger
from app.workers.celery_app import celery

# Register every module's models so SQLAlchemy can resolve cross-module foreign
# keys (e.g. work_orders.assignee_id → users) when this task runs in the worker
# process, which otherwise only imports the scheduler's direct dependencies.
from app.modules.analytics import models as _analytics  # noqa: E402,F401
from app.modules.auth import models as _auth  # noqa: E402,F401
from app.modules.compliance import models as _compliance  # noqa: E402,F401
from app.modules.dashboards import models as _dashboards  # noqa: E402,F401
from app.modules.documents import models as _documents  # noqa: E402,F401
from app.modules.equipment import models as _equipment  # noqa: E402,F401
from app.modules.ingestion import models as _ingestion  # noqa: E402,F401
from app.modules.lessons import models as _lessons  # noqa: E402,F401
from app.modules.lookups import models as _lookups  # noqa: E402,F401
from app.modules.maintenance import models as _maintenance  # noqa: E402,F401
from app.modules.notifications import models as _notifications  # noqa: E402,F401
from app.modules.quality import models as _quality  # noqa: E402,F401
from app.modules.tenants import models as _tenants  # noqa: E402,F401
from app.modules.users import models as _users  # noqa: E402,F401

log = get_logger("workers.scheduler")


async def _run_pm_due() -> dict:
    from app.core.database import SessionFactory
    from app.modules.maintenance.service import ScheduleService
    from app.modules.tenants.models import Tenant

    total = 0
    async with SessionFactory() as session:
        tenants = list((await session.execute(
            select(Tenant).where(Tenant.deleted_at.is_(None)))).scalars())
        for tenant in tenants:
            created = await ScheduleService(session, tenant.id).generate_due()
            total += len(created)
        await session.commit()
    return {"work_orders_created": total, "tenants": len(tenants)}


@celery.task(name="app.workers.tasks.scheduler_tasks.pm_due_checker")
def pm_due_checker() -> dict:
    """Hourly: due PM schedules → auto-create work orders (docs/02 §36)."""
    result = asyncio.run(_run_pm_due())
    log.info("pm_due_checker_done", **result)
    return result


async def _run_predictions(criticality: str | None) -> dict:
    from app.core.database import SessionFactory
    from app.modules.maintenance.prediction_service import PredictionService
    from app.modules.tenants.models import Tenant

    total = 0
    async with SessionFactory() as session:
        tenants = list((await session.execute(
            select(Tenant).where(Tenant.deleted_at.is_(None)))).scalars())
        for tenant in tenants:
            preds = await PredictionService(session, tenant.id).refresh(criticality=criticality)
            total += len(preds)
        await session.commit()
    return {"predictions": total, "criticality": criticality, "tenants": len(tenants)}


@celery.task(name="app.workers.tasks.scheduler_tasks.refresh_predictions")
def refresh_predictions(criticality: str | None = None) -> dict:
    """Predictive-maintenance refresh (docs/02 §36): all every 6h, criticality-A every 5 min."""
    result = asyncio.run(_run_predictions(criticality))
    log.info("refresh_predictions_done", **result)
    return result


async def _run_compliance_scan() -> dict:
    from app.core.database import SessionFactory
    from app.modules.compliance.mapping_agent import ComplianceScanService
    from app.modules.tenants.models import Tenant

    totals = {"clauses": 0, "mappings": 0, "gaps": 0}
    async with SessionFactory() as session:
        tenants = list((await session.execute(
            select(Tenant).where(Tenant.deleted_at.is_(None)))).scalars())
        for tenant in tenants:
            result = await ComplianceScanService(session, tenant.id).scan(scope={})
            for k in totals:
                totals[k] += result.get(k, 0)
        await session.commit()
    return {**totals, "tenants": len(tenants)}


@celery.task(name="app.workers.tasks.scheduler_tasks.compliance_delta_scan")
def compliance_delta_scan() -> dict:
    """Daily compliance delta scan (docs/02 §19, §36): re-map clauses, raise new gaps."""
    result = asyncio.run(_run_compliance_scan())
    log.info("compliance_delta_scan_done", **result)
    return result


async def _run_lessons_detection() -> dict:
    from app.core.database import SessionFactory
    from app.modules.lessons.agent import LessonsAgent
    from app.modules.tenants.models import Tenant

    total = 0
    async with SessionFactory() as session:
        tenants = list((await session.execute(
            select(Tenant).where(Tenant.deleted_at.is_(None)))).scalars())
        for tenant in tenants:
            created = await LessonsAgent(session, tenant.id).detect(scope={})
            total += len(created)
        await session.commit()
    return {"lessons": total, "tenants": len(tenants)}


@celery.task(name="app.workers.tasks.scheduler_tasks.detect_lessons")
def detect_lessons() -> dict:
    """Weekly lessons-learned pattern detection (docs/02 §36)."""
    result = asyncio.run(_run_lessons_detection())
    log.info("detect_lessons_done", **result)
    return result


async def _run_notification_digest() -> dict:
    from app.core.database import SessionFactory
    from app.modules.notifications import senders
    from app.modules.notifications.repository import NotificationRepository
    from app.modules.tenants.models import Tenant

    sent = 0
    async with SessionFactory() as session:
        tenants = list((await session.execute(
            select(Tenant).where(Tenant.deleted_at.is_(None)))).scalars())
        for tenant in tenants:
            from app.modules.auth.models import User

            users = list((await session.execute(select(User).where(
                User.tenant_id == tenant.id, User.deleted_at.is_(None),
                User.status == "active"))).scalars())
            for user in users:
                repo = NotificationRepository(session, tenant.id)
                count = await repo.unread_count(user.id)
                if count:
                    body = f"You have {count} unread notification(s) in IndusMind."
                    if await senders.send_email(to_email=user.email,
                                                subject="IndusMind daily digest", body=body):
                        sent += 1
    return {"digests_sent": sent}


@celery.task(name="app.workers.tasks.scheduler_tasks.notification_digest")
def notification_digest() -> dict:
    """Daily notification digest email (docs/02 §20, §36)."""
    result = asyncio.run(_run_notification_digest())
    log.info("notification_digest_done", **result)
    return result


async def _run_scheduled_reports() -> dict:
    from app.core.database import SessionFactory
    from app.modules.analytics.repository import ScheduleRepository
    from app.modules.analytics.service import AnalyticsService
    from app.modules.notifications import senders
    from app.modules.tenants.models import Tenant

    ran = 0
    async with SessionFactory() as session:
        tenants = list((await session.execute(
            select(Tenant).where(Tenant.deleted_at.is_(None)))).scalars())
        for tenant in tenants:
            svc = AnalyticsService(session, tenant.id)
            for sched in await ScheduleRepository(session, tenant.id).list_active():
                try:
                    result = await svc.run(sched.report_id, params=sched.params)
                except Exception as exc:  # noqa: BLE001 — one bad report must not stop the beat
                    log.warning("scheduled_report_failed", schedule_id=str(sched.id), error=str(exc))
                    continue
                from datetime import UTC, datetime

                sched.last_run_at = datetime.now(UTC)
                for recipient in sched.recipients or []:
                    await senders.send_email(
                        to_email=recipient, subject=f"Report: {result['report']['name']}",
                        body=f"{result['row_count']} rows.")
                ran += 1
        await session.commit()
    return {"reports_run": ran}


@celery.task(name="app.workers.tasks.scheduler_tasks.run_scheduled_reports")
def run_scheduled_reports() -> dict:
    """Emailed scheduled analytics reports (docs/02 §22, §36)."""
    result = asyncio.run(_run_scheduled_reports())
    log.info("run_scheduled_reports_done", **result)
    return result
