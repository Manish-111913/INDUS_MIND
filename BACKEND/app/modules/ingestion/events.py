"""Ingestion module events (docs/02 §11, §34).

Subscribes to document.uploaded / document.reprocess on the internal bus and
enqueues the Celery `ingest_document` task (the API process publishes; the worker
process runs the pipeline — the bus↔queue seam of §34).
"""

from __future__ import annotations

from app.core.events import Event, EventType, bus
from app.core.logging import get_logger

log = get_logger("ingestion.events")


def _enqueue(event: Event) -> None:
    document_id = event.payload.get("document_id")
    if not document_id or not event.tenant_id:
        return
    from app.workers.tasks.ingestion_tasks import ingest_document

    ingest_document.delay(document_id, event.tenant_id, event.payload.get("from_stage"))
    log.info("ingest_enqueued", document_id=document_id)


async def _on_document_event(event: Event) -> None:
    _enqueue(event)


bus.subscribe(EventType.DOCUMENT_UPLOADED, _on_document_event)
bus.subscribe(EventType.DOCUMENT_REPROCESS, _on_document_event)
