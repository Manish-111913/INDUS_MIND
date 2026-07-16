"""Document service (docs/02 §12, §17, §39).

Server issues pre-signed PUTs (client uploads direct); confirm verifies the
object exists, matches the client checksum, and sniffs its MIME (libmagic) before
accepting metadata and creating the ingestion job. Every mutation writes audit +
publishes a typed event; the pipeline (B5) consumes document.uploaded.
"""

from __future__ import annotations

import asyncio
import builtins  # `list` is shadowed by a `list()` method below
import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams, PageResult
from app.core import storage
from app.core.events import Event, EventType, bus
from app.core.exceptions import NotFound, ValidationFailed
from app.core.logging import get_logger
from app.modules.audit.service import AuditService
from app.modules.documents.models import (
    INGESTION_STATES,
    Document,
    DocumentVersion,
    IngestionJob,
)
from app.modules.documents.providers import entity_link_registry
from app.modules.documents.repository import (
    DocumentRepository,
    DocumentVersionRepository,
    IngestionJobRepository,
)
from app.modules.lookups.service import LookupService

log = get_logger("documents.service")

MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB
PIPELINE_STAGES = ["ocr", "parsing", "chunking", "embedding", "extracting", "graphing"]

# Allowed upload MIME types (docs/02 §5, §39).
ALLOWED_MIMES = {
    "application/pdf",
    "image/png", "image/jpeg", "image/tiff", "image/webp",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # xlsx
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # docx
    "application/msword",
    "application/vnd.ms-outlook",  # msg
    "message/rfc822",  # eml
    "text/plain", "text/csv",
}


class DocumentService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = DocumentRepository(session, tenant_id)
        self.versions = DocumentVersionRepository(session, tenant_id)
        self.jobs = IngestionJobRepository(session, tenant_id)
        self.lookups = LookupService(session, tenant_id)
        self.audit = AuditService(session)

    # ── upload-url ───────────────────────────────────────────────────────────
    async def create_upload_url(self, *, filename: str, mime: str, size: int,
                                title: str | None, actor) -> dict:
        self._validate_upload(mime=mime, size=size)
        document = await self.repo.add(Document(
            title=title or filename, source="upload", mime=mime, size_bytes=size,
            storage_key="", ingestion_status="pending", uploaded_by=actor.id,
            created_by=actor.id, updated_by=actor.id))
        key = storage.document_key(str(self.tenant_id), str(document.id), 1, filename)
        version = await self.versions.add(DocumentVersion(
            document_id=document.id, version_no=1, storage_key=key, mime=mime, size_bytes=size,
            created_by=actor.id, updated_by=actor.id))
        document.storage_key = key
        document.current_version_id = version.id
        await self.session.flush()
        await self.audit.write(action="document.upload_url", entity_type="document",
                               entity_id=document.id, tenant_id=self.tenant_id, actor_id=actor.id)
        url = storage.presigned_put(key, content_type=mime)
        return {"document_id": document.id, "presigned_url": url, "storage_key": key}

    # ── confirm ──────────────────────────────────────────────────────────────
    async def confirm(self, document_id: uuid.UUID, *, checksum: str, meta, actor) -> Document:
        document = await self._get(document_id)
        version = await self.versions.get(document.current_version_id) if document.current_version_id else None
        if version is None:
            raise ValidationFailed("No pending version to confirm", code="NO_PENDING_VERSION",
                                   http_status=422)
        key = version.storage_key

        stat = await asyncio.to_thread(storage.stat_object, key)
        if stat is None:
            raise ValidationFailed("Uploaded object not found in storage",
                                   code="OBJECT_NOT_FOUND", http_status=422)

        actual = await asyncio.to_thread(storage.compute_sha256, key)
        if actual.lower() != checksum.lower():
            raise ValidationFailed("Checksum mismatch", code="CHECKSUM_MISMATCH", http_status=422,
                                   field_errors={"checksum": "does not match uploaded object"})

        prefix = await asyncio.to_thread(storage.read_prefix, key, 4096)
        sniffed = storage.sniff_mime(prefix)
        if sniffed is not None and sniffed not in ALLOWED_MIMES:
            raise ValidationFailed(f"Detected disallowed content type: {sniffed}",
                                   code="MIME_NOT_ALLOWED", http_status=422)

        await self._validate_meta(meta)

        # persist metadata + finalize version
        if meta.doc_type_id is not None:
            document.doc_type_id = meta.doc_type_id
        if meta.plant_id is not None:
            document.plant_id = meta.plant_id
        if meta.title:
            document.title = meta.title
        if meta.language:
            document.language = meta.language
        if meta.tags:
            document.tags = meta.tags
        document.checksum = checksum
        document.size_bytes = stat["size"]
        document.ingestion_status = "pending"
        document.updated_by = actor.id
        version.checksum = checksum
        version.size_bytes = stat["size"]
        version.confirmed_at = datetime.now(UTC)

        job = await self._create_job(document, version)
        await self.session.flush()
        await self.audit.write(action="document.confirm", entity_type="document",
                               entity_id=document.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"version_no": version.version_no})
        await bus.publish(Event(EventType.DOCUMENT_UPLOADED, tenant_id=str(self.tenant_id),
                                actor_id=str(actor.id),
                                payload={"document_id": str(document.id), "version_id": str(version.id),
                                         "job_id": str(job.id), "storage_key": key}))
        return document

    # ── reads ────────────────────────────────────────────────────────────────
    async def list(self, params: PageParams, *, doc_type_id=None, ingestion_status=None,
                   equipment_id=None, tag=None, date_from=None, date_to=None, q=None) -> PageResult:
        restrict_ids = None
        if equipment_id is not None:
            restrict_ids = await entity_link_registry.documents_for_equipment(
                self.session, self.tenant_id, equipment_id)
        return await self.repo.list(
            params, doc_type_id=doc_type_id, ingestion_status=ingestion_status, tag=tag,
            date_from=date_from, date_to=date_to, q=q, restrict_ids=restrict_ids)

    async def get(self, document_id: uuid.UUID) -> Document:
        return await self._get(document_id)

    async def get_detail(self, document_id: uuid.UUID) -> tuple[Document, IngestionJob | None]:
        document = await self._get(document_id)
        job = await self.jobs.latest_for_document(document.id)
        return document, job

    async def download_url(self, document_id: uuid.UUID) -> str:
        document = await self._get(document_id)
        return storage.presigned_get(document.storage_key)

    async def list_versions(self, document_id: uuid.UUID) -> builtins.list[DocumentVersion]:
        await self._get(document_id)
        return await self.versions.list_for_document(document_id)

    async def thumbnail_url(self, document_id: uuid.UUID, page: int) -> str:
        await self._get(document_id)
        key = storage.thumbnail_key(str(self.tenant_id), str(document_id), page)
        if not await asyncio.to_thread(storage.object_exists, key):
            # Generated by the pipeline (B5); until then the client shows a fallback.
            raise NotFound("Thumbnail not generated yet", code="THUMBNAIL_NOT_AVAILABLE")
        return storage.presigned_get(key)

    # ── new version (→ re-ingest on confirm) ─────────────────────────────────
    async def create_version(self, document_id: uuid.UUID, *, filename: str, mime: str,
                             size: int, notes: str | None, actor) -> dict:
        self._validate_upload(mime=mime, size=size)
        document = await self._get(document_id)
        next_no = await self.versions.max_version_no(document.id) + 1
        key = storage.document_key(str(self.tenant_id), str(document.id), next_no, filename)
        version = await self.versions.add(DocumentVersion(
            document_id=document.id, version_no=next_no, storage_key=key, mime=mime,
            size_bytes=size, notes=notes, created_by=actor.id, updated_by=actor.id))
        document.current_version_id = version.id
        document.storage_key = key
        document.mime = mime
        document.ingestion_status = "pending"
        document.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="document.new_version", entity_type="document",
                               entity_id=document.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"version_no": next_no})
        url = storage.presigned_put(key, content_type=mime)
        return {"document_id": document.id, "version_no": next_no,
                "presigned_url": url, "storage_key": key}

    # ── reprocess ────────────────────────────────────────────────────────────
    async def reprocess(self, document_id: uuid.UUID, *, from_stage: str | None, actor) -> IngestionJob:
        document = await self._get(document_id)
        if from_stage is not None and from_stage not in PIPELINE_STAGES:
            raise ValidationFailed(f"Unknown stage '{from_stage}'", code="VALIDATION_ERROR",
                                   http_status=422, field_errors={"from_stage": "unknown stage"})
        version = await self.versions.get(document.current_version_id) if document.current_version_id else None
        job = await self._create_job(document, version, from_stage=from_stage)
        document.ingestion_status = "pending"
        document.ingestion_error = None
        document.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="document.reprocess", entity_type="document",
                               entity_id=document.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"from_stage": from_stage})
        await bus.publish(Event(EventType.DOCUMENT_REPROCESS, tenant_id=str(self.tenant_id),
                                actor_id=str(actor.id),
                                payload={"document_id": str(document.id), "job_id": str(job.id),
                                         "from_stage": from_stage}))
        return job

    async def delete(self, document_id: uuid.UUID, *, actor) -> None:
        from sqlalchemy import func

        document = await self._get(document_id)
        document.deleted_at = func.now()  # originals never physically deleted (§12)
        document.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="document.delete", entity_type="document",
                               entity_id=document.id, tenant_id=self.tenant_id, actor_id=actor.id)

    # ── internals ────────────────────────────────────────────────────────────
    async def _get(self, document_id: uuid.UUID) -> Document:
        document = await self.repo.get(document_id)
        if document is None:
            raise NotFound("Document not found", code="DOCUMENT_NOT_FOUND")
        return document

    def _validate_upload(self, *, mime: str, size: int) -> None:
        field_errors: dict[str, str] = {}
        if size > MAX_UPLOAD_BYTES:
            field_errors["size"] = f"exceeds {MAX_UPLOAD_BYTES} bytes"
        if mime not in ALLOWED_MIMES:
            field_errors["mime"] = f"unsupported content type '{mime}'"
        if field_errors:
            raise ValidationFailed("Invalid upload", code="VALIDATION_ERROR", http_status=422,
                                   field_errors=field_errors)

    async def _validate_meta(self, meta) -> None:
        field_errors: dict[str, str] = {}
        if meta.doc_type_id is not None:
            ids = {row.id for row in await self.lookups.by_category("doc_types")}
            if meta.doc_type_id not in ids:
                field_errors["doc_type_id"] = "unknown document type"
        if meta.plant_id is not None:
            from app.modules.equipment.service import PlantService

            try:
                await PlantService(self.session, self.tenant_id).get(meta.plant_id)
            except NotFound:
                field_errors["plant_id"] = "plant not found"
        if field_errors:
            raise ValidationFailed("Invalid metadata", code="VALIDATION_ERROR", http_status=422,
                                   field_errors=field_errors)

    async def _create_job(self, document: Document, version: DocumentVersion | None,
                          *, from_stage: str | None = None) -> IngestionJob:
        start = PIPELINE_STAGES.index(from_stage) if from_stage in PIPELINE_STAGES else 0
        stages = [{"stage": s, "status": "pending", "started": None, "finished": None, "detail": None}
                  for s in PIPELINE_STAGES[start:]]
        return await self.jobs.add(IngestionJob(
            document_id=document.id, version_id=version.id if version else None,
            status="pending", current_stage=None, stages=stages))


# expose for callers/tests
__all__ = ["DocumentService", "ALLOWED_MIMES", "MAX_UPLOAD_BYTES", "PIPELINE_STAGES", "INGESTION_STATES"]
