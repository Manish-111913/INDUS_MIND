"""Celery application (docs/02 §32, §33, §36).

Queues: ingestion (CPU pool), ai (IO), notify, scheduled, default. Result
backend Redis (24h TTL). Concrete tasks (ingest_document chain, agents,
scheduler, notify fan-out) register under app/workers/tasks/ as modules land.
Beat schedules will be sourced from the DB `schedules` table (editable).
"""

from __future__ import annotations

from celery import Celery
from kombu import Queue

from app.core.config import settings

celery = Celery(
    "indusmind",
    broker=settings.redis_url,
    backend=settings.redis_url,
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
        "app.workers.tasks.agent_tasks.*": {"queue": "ai"},
        "app.workers.tasks.notify_tasks.*": {"queue": "notify"},
        "app.workers.tasks.scheduler_tasks.*": {"queue": "scheduled"},
    },
)

# celery.autodiscover_tasks(["app.workers.tasks"])  # enabled as task modules land


@celery.task(name="app.workers.ping")
def ping() -> str:
    """Trivial task to confirm broker + worker wiring end-to-end."""
    return "pong"
