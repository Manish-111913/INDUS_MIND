"""Celery application (docs/02 §32, §33, §36).

Queues: ingestion (CPU pool), ai (IO), notify, scheduled, default. Result
backend Redis (24h TTL). Concrete tasks (ingest_document chain, agents,
scheduler, notify fan-out) register under app/workers/tasks/ as modules land.
Beat schedules will be sourced from the DB `schedules` table (editable).
"""

from __future__ import annotations

from celery import Celery
from celery.schedules import crontab
from kombu import Queue

from app.core.config import settings

celery = Celery(
    "indusmind",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.workers.tasks.ingestion_tasks",
        "app.workers.tasks.scheduler_tasks",
        "app.workers.tasks.compliance_tasks",
        "app.workers.tasks.dataops_tasks",
        "app.workers.tasks.integration_tasks",
        "app.workers.tasks.onboarding_tasks",
        "app.workers.tasks.equipment_tasks",
        "app.workers.tasks.retention_tasks",
    ],
)

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    result_expires=86_400,  # 24h (docs/02 §32)
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_default_queue="default",
    task_queues=(
        Queue("ingestion"),
        Queue("ai"),
        Queue("notify"),
        Queue("scheduled"),
        Queue("default"),
    ),
    task_routes={
        "app.workers.tasks.ingestion_tasks.*": {"queue": "ingestion"},
        "app.workers.tasks.compliance_tasks.*": {"queue": "ai"},
        "app.workers.tasks.agent_tasks.*": {"queue": "ai"},
        "app.workers.tasks.notify_tasks.*": {"queue": "notify"},
        "app.workers.tasks.scheduler_tasks.*": {"queue": "scheduled"},
        # Import parsing / export rendering are CPU-ish file work (docs/05 S6).
        "app.workers.tasks.dataops_tasks.validate_import": {"queue": "ingestion"},
        "app.workers.tasks.dataops_tasks.apply_import": {"queue": "ingestion"},
        "app.workers.tasks.dataops_tasks.render_export": {"queue": "ingestion"},
        "app.workers.tasks.dataops_tasks.run_report_schedules": {"queue": "scheduled"},
        # Webhook delivery is network-bound fan-out, not user-facing notification.
        "app.workers.tasks.integration_tasks.deliver_webhook": {"queue": "notify"},
        "app.workers.tasks.integration_tasks.sweep_webhook_retries": {"queue": "scheduled"},
        # Seeding uploads + ingests the demo corpus — same work as any ingestion job.
        "app.workers.tasks.onboarding_tasks.seed_demo_task": {"queue": "ingestion"},
        "app.workers.tasks.equipment_tasks.render_label_sheet": {"queue": "ingestion"},
        "app.workers.tasks.retention_tasks.run_retention_policies": {"queue": "scheduled"},
    },
    # Beat schedule (docs/02 §36). Domain PM schedules live in the DB `schedules`
    # table; these are the system beat entries that read it.
    beat_schedule={
        "pm-due-checker-hourly": {
            "task": "app.workers.tasks.scheduler_tasks.pm_due_checker",
            "schedule": crontab(minute=0),  # top of every hour
            "options": {"queue": "scheduled"},
        },
        # Webhook retries (docs/05 S8). Every minute because the first backoff step
        # is 1 min — a coarser tick would stretch the whole schedule.
        "webhook-retry-sweep": {
            "task": "app.workers.tasks.integration_tasks.sweep_webhook_retries",
            "schedule": crontab(minute="*"),
            "options": {"queue": "scheduled"},
        },
        # Data retention (docs/08 S14) — nightly at 01:15, before the daily reports.
        "retention-nightly": {
            "task": "app.workers.tasks.retention_tasks.run_retention_policies",
            "schedule": crontab(minute=15, hour=1),
            "options": {"queue": "scheduled"},
        },
        # Predictive-maintenance refresh (docs/02 §36).
        "predictions-refresh-6h": {
            "task": "app.workers.tasks.scheduler_tasks.refresh_predictions",
            "schedule": crontab(minute=0, hour="*/6"),
            "options": {"queue": "scheduled"},
        },
        "predictions-refresh-critical-5min": {
            "task": "app.workers.tasks.scheduler_tasks.refresh_predictions",
            "schedule": crontab(minute="*/5"),
            "kwargs": {"criticality": "A"},
            "options": {"queue": "scheduled"},
        },
        # Compliance delta scan (docs/02 §19, §36): daily at 02:30.
        "compliance-delta-scan-daily": {
            "task": "app.workers.tasks.scheduler_tasks.compliance_delta_scan",
            "schedule": crontab(minute=30, hour=2),
            "options": {"queue": "scheduled"},
        },
        # Weekly lessons-learned pattern detection (docs/02 §36): Mondays 03:00.
        "detect-lessons-weekly": {
            "task": "app.workers.tasks.scheduler_tasks.detect_lessons",
            "schedule": crontab(minute=0, hour=3, day_of_week=1),
            "options": {"queue": "scheduled"},
        },
        # Daily notification digest email (docs/02 §20, §36): 06:00.
        "notification-digest-daily": {
            "task": "app.workers.tasks.scheduler_tasks.notification_digest",
            "schedule": crontab(minute=0, hour=6),
            "options": {"queue": "notify"},
        },
        # Emailed scheduled analytics reports (docs/02 §22, §36): 07:00.
        "scheduled-reports-daily": {
            "task": "app.workers.tasks.scheduler_tasks.run_scheduled_reports",
            "schedule": crontab(minute=0, hour=7),
            "options": {"queue": "scheduled"},
        },
        # Report-template schedules (docs/05 S6). Ticks every 5 min; the cron on
        # each `report_schedules` row (croniter) decides what actually runs, so
        # admins can edit schedules in the DB without a redeploy (docs/02 §36).
        "report-schedules-tick": {
            "task": "app.workers.tasks.dataops_tasks.run_report_schedules",
            "schedule": crontab(minute="*/5"),
            "options": {"queue": "scheduled"},
        },
    },
)

# Prometheus task-duration/outcome metrics + worker exporter (docs/02 §29).
# Connects Celery signals; the exporter only starts inside the worker process
# (worker_ready), so importing this module from the API is a no-op there.
if settings.metrics_enabled:
    from app.core.metrics import init_celery_metrics

    init_celery_metrics()


@celery.task(name="app.workers.ping")
def ping() -> str:
    """Trivial task to confirm broker + worker wiring end-to-end."""
    return "pong"
