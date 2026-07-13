"""Ingestion pipeline orchestrator (docs/02 §10 steps 1–5, §11).

Stages: ocr → parsing → chunking → embedding → finalize. Entity extraction +
graph upsert (the last two job stages) are appended in B6. Each stage updates the
ingestion_job's stage JSONB with timestamps/durations, publishes WS progress, and
is idempotent (re-runnable; embedding skips chunks that already have a vector).

Runs as an async function so it's directly testable; the Celery task wraps it.
"""

from __future__ import annotations

import asyncio
import hashlib
import time
import uuid
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core import storage
from app.core.embeddings import get_embedding_provider
from app.core.events import Event, EventType, bus
from app.core.logging import get_logger
from app.core.ocr import extract_pages
from app.modules.documents.models import Document, IngestionJob
from app.modules.documents.repository import DocumentRepository, IngestionJobRepository
from app.modules.ingestion.chunking import chunk_document
from app.modules.ingestion.models import DocumentChunk
from app.modules.ingestion.parsing import parse_document
from app.modules.ingestion.repository import ChunkRepository
from app.modules.ingestion.thumbnails import generate_thumbnails
from app.ws import progress

log = get_logger("ingestion.pipeline")

B5_STAGES = ["ocr", "parsing", "chunking", "embedding"]
DEFERRED_STAGES = ["extracting", "graphing"]  # implemented in B6


class PipelineError(Exception):
    def __init__(self, stage: str, cause: Exception) -> None:
        self.stage = stage
        super().__init__(f"stage '{stage}' failed: {cause}")


async def run_pipeline(session: AsyncSession, tenant_id: uuid.UUID | str,
                       document_id: uuid.UUID | str, *, from_stage: str | None = None) -> IngestionJob:
    docs = DocumentRepository(session, tenant_id)
    jobs = IngestionJobRepository(session, tenant_id)
    chunks_repo = ChunkRepository(session, tenant_id)

    document = await docs.get(document_id)
    if document is None:
        raise PipelineError("load", ValueError("document not found"))
    job = await jobs.latest_for_document(document_id)
    if job is None:
        raise PipelineError("load", ValueError("ingestion job not found"))

    start = B5_STAGES.index(from_stage) if from_stage in B5_STAGES else 0
    document.ingestion_status = "pending"
    document.ingestion_error = None
    job.status = "running"
    await session.flush()

    data = await asyncio.to_thread(storage.read_object, document.storage_key)
    parsed = None

    try:
        if start <= B5_STAGES.index("chunking"):
            # ── ocr ──
            async with _stage(session, job, tenant_id, "ocr", document):
                pages = await asyncio.to_thread(extract_pages, data, document.mime)

            # ── parsing (+ thumbnails) ──
            async with _stage(session, job, tenant_id, "parsing", document):
                parsed = await asyncio.to_thread(parse_document, document.mime, data, pages)
                thumbs = await asyncio.to_thread(
                    generate_thumbnails, tenant_id, document.id, data, document.mime)
                document.page_count = parsed.page_count or thumbs or document.page_count

            # ── chunking ──
            async with _stage(session, job, tenant_id, "chunking", document):
                await chunks_repo.delete_for_version(document.current_version_id)
                rows = [
                    DocumentChunk(
                        document_id=document.id, version_id=document.current_version_id,
                        chunk_index=c.chunk_index, page_no=c.page_no, text=c.text,
                        token_count=c.token_count, section_path=c.section_path, bbox=c.bbox,
                        checksum=hashlib.sha256(c.text.encode()).hexdigest())
                    for c in chunk_document(parsed)
                ]
                await chunks_repo.add_many(rows)

        # ── embedding (idempotent: only chunks without a vector) ──
        async with _stage(session, job, tenant_id, "embedding", document):
            await _embed_chunks(session, tenant_id, document.current_version_id)

        await _finalize(session, job, document, tenant_id)
    except Exception as exc:  # noqa: BLE001 — surface as a typed pipeline error for retry/fail
        stage = getattr(exc, "stage", "unknown")
        raise PipelineError(stage, exc) from exc

    return job


async def _embed_chunks(session: AsyncSession, tenant_id, version_id) -> None:
    stmt = (
        select(DocumentChunk)
        .where(DocumentChunk.tenant_id == tenant_id, DocumentChunk.version_id == version_id,
               DocumentChunk.embedding.is_(None))
        .order_by(DocumentChunk.chunk_index)
    )
    pending = list((await session.execute(stmt)).scalars().all())
    if not pending:
        return
    provider = get_embedding_provider()
    vectors = await asyncio.to_thread(provider.embed_batched, [c.text for c in pending])
    for chunk, vector in zip(pending, vectors, strict=True):
        chunk.embedding = vector
    await session.flush()


async def _finalize(session, job, document, tenant_id) -> None:
    stages = [dict(e) for e in job.stages]
    for entry in stages:
        if entry["stage"] in DEFERRED_STAGES and entry["status"] == "pending":
            entry["status"] = "skipped"
            entry["detail"] = "deferred to entity/graph stage (B6)"
    job.stages = stages
    flag_modified(job, "stages")
    job.status = "completed"
    job.current_stage = None
    document.ingestion_status = "completed"
    await session.flush()
    await progress.publish_progress(tenant_id, job_id=job.id, stage="finalize", pct=100,
                                    detail="ingestion complete")
    await bus.publish(Event(EventType.DOCUMENT_INGESTED, tenant_id=str(tenant_id),
                            payload={"document_id": str(document.id), "job_id": str(job.id)}))


class _stage:
    """Async context manager: mark a job stage running → completed with timing +
    WS progress; on error mark it failed and re-raise (tagged with the stage)."""

    def __init__(self, session, job: IngestionJob, tenant_id, name: str, document) -> None:
        self.session, self.job, self.tenant_id, self.name = session, job, tenant_id, name
        self.document = document

    async def __aenter__(self):
        self._t0 = time.monotonic()
        self._set(status="running", started=datetime.now(UTC).isoformat())
        self.job.current_stage = self.name
        await self.session.flush()
        return self

    async def __aexit__(self, exc_type, exc, tb):
        if exc_type is not None:
            self._set(status="failed", detail=str(exc))
            await self.session.flush()
            exc.stage = self.name  # type: ignore[attr-defined]
            return False
        duration = round(time.monotonic() - self._t0, 3)
        self._set(status="completed", finished=datetime.now(UTC).isoformat())
        durations = dict(self.job.durations)
        durations[self.name] = duration
        self.job.durations = durations
        flag_modified(self.job, "durations")
        await self.session.flush()
        await progress.publish_progress(
            self.tenant_id, job_id=self.job.id, stage=self.name, pct=self._pct(),
            detail=f"{self.name} done in {duration}s")
        return False

    def _set(self, **fields) -> None:
        stages = [dict(e) for e in self.job.stages]
        for entry in stages:
            if entry["stage"] == self.name:
                entry.update(fields)
                break
        self.job.stages = stages
        flag_modified(self.job, "stages")

    def _pct(self) -> int:
        stages = self.job.stages
        done = sum(1 for e in stages if e["status"] in ("completed", "skipped"))
        return int(done / len(stages) * 100) if stages else 0


async def mark_failed(session: AsyncSession, tenant_id: uuid.UUID | str,
                      document_id: uuid.UUID | str, error: str) -> None:
    """Poison-pill handler (after retries): mark job+document failed, emit event."""
    await session.execute(
        update(Document).where(Document.id == document_id, Document.tenant_id == tenant_id)
        .values(ingestion_status="failed", ingestion_error=error[:2000])
    )
    job = await IngestionJobRepository(session, tenant_id).latest_for_document(document_id)
    if job is not None:
        job.status = "failed"
        job.error = error[:2000]
        await session.flush()
    await bus.publish(Event(EventType.INGESTION_FAILED, tenant_id=str(tenant_id),
                            payload={"document_id": str(document_id), "error": error[:500]}))
