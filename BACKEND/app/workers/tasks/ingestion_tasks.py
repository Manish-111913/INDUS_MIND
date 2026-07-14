"""Ingestion Celery task (docs/02 §11, §32).

Wraps the async pipeline. Retries 3× with exponential backoff; on the final
failure it marks the job/document failed and emits ingestion.failed (poison-pill
handling). Runs on the `ingestion` queue (CPU-bound prefork pool).
"""

from __future__ import annotations

import asyncio

from app.core.logging import get_logger
from app.modules.ingestion.pipeline import mark_failed, run_pipeline
from app.workers.celery_app import celery

log = get_logger("workers.ingestion")


async def _run(document_id: str, tenant_id: str, from_stage: str | None) -> None:
    from app.core.database import SessionFactory

    async with SessionFactory() as session:
        await run_pipeline(session, tenant_id, document_id, from_stage=from_stage)
        await session.commit()


async def _fail(document_id: str, tenant_id: str, error: str) -> None:
    from app.core.database import SessionFactory

    async with SessionFactory() as session:
        await mark_failed(session, tenant_id, document_id, error)
        await session.commit()


@celery.task(bind=True, name="app.workers.tasks.ingestion_tasks.ingest_document",
             max_retries=3, acks_late=True)
def ingest_document(self, document_id: str, tenant_id: str, from_stage: str | None = None):
    try:
        asyncio.run(_run(document_id, tenant_id, from_stage))
        return {"document_id": document_id, "status": "completed"}
    except Exception as exc:  # noqa: BLE001
        log.error("ingest_failed", document_id=document_id, retries=self.request.retries,
                  error=str(exc))
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=2 ** self.request.retries) from exc  # exp backoff
        asyncio.run(_fail(document_id, tenant_id, str(exc)))
        raise
