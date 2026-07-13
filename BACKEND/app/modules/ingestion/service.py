"""Ingestion admin service — job monitor (docs/02 §11, §33).

Reads/mutates the ingestion_jobs owned by the documents module through its
repository (ingestion is that module's pipeline — tight, intentional coupling).
Retry re-enqueues the pipeline; cancel marks the job cancelled.
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.common.pagination import PageParams, PageResult
from app.core.exceptions import ConflictError, NotFound, ValidationFailed, VersionMismatch
from app.modules.audit.service import AuditService
from app.modules.documents.models import IngestionJob
from app.modules.documents.repository import DocumentRepository, IngestionJobRepository
from app.modules.ingestion.models import ExtractedEntity
from app.modules.ingestion.repository import EntityRepository


class IngestionService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.jobs = IngestionJobRepository(session, tenant_id)
        self.docs = DocumentRepository(session, tenant_id)
        self.audit = AuditService(session)

    async def list(self, params: PageParams, *, status: str | None,
                   document_id: uuid.UUID | None) -> PageResult:
        return await self.jobs.list(params, status=status, document_id=document_id)

    async def get(self, job_id: uuid.UUID) -> IngestionJob:
        job = await self.jobs.get(job_id)
        if job is None:
            raise NotFound("Ingestion job not found", code="JOB_NOT_FOUND")
        return job

    async def retry(self, job_id: uuid.UUID, *, actor) -> IngestionJob:
        job = await self.get(job_id)
        document = await self.docs.get(job.document_id)
        if document is None:
            raise NotFound("Document not found", code="DOCUMENT_NOT_FOUND")
        # Reset stages to pending and re-enqueue the pipeline.
        job.status = "pending"
        job.error = None
        job.retries = job.retries + 1
        job.current_stage = None
        job.stages = [{**s, "status": "pending", "started": None, "finished": None, "detail": None}
                      for s in job.stages]
        flag_modified(job, "stages")
        document.ingestion_status = "pending"
        document.ingestion_error = None
        await self.session.flush()
        await self.session.refresh(job)  # resolve server-side onupdate before serialize
        await self.audit.write(action="ingestion.retry", entity_type="ingestion_job",
                               entity_id=job.id, tenant_id=self.tenant_id, actor_id=actor.id)
        from app.workers.tasks.ingestion_tasks import ingest_document

        ingest_document.delay(str(job.document_id), str(self.tenant_id), None)
        return job

    async def cancel(self, job_id: uuid.UUID, *, actor) -> IngestionJob:
        job = await self.get(job_id)
        if job.status in ("completed", "failed", "cancelled"):
            raise ConflictError(f"Job already {job.status}", code="JOB_NOT_CANCELLABLE")
        job.status = "cancelled"
        await self.session.flush()
        await self.session.refresh(job)  # resolve server-side onupdate before serialize
        await self.audit.write(action="ingestion.cancel", entity_type="ingestion_job",
                               entity_id=job.id, tenant_id=self.tenant_id, actor_id=actor.id)
        return job


class EntityService:
    """Extracted-entity review — human-in-the-loop confirm/correct/reject (docs/02 §17)."""

    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = EntityRepository(session, tenant_id)
        self.docs = DocumentRepository(session, tenant_id)
        self.audit = AuditService(session)

    async def list_for_document(self, document_id: uuid.UUID, *, status: str | None) -> list:
        if await self.docs.get(document_id) is None:
            raise NotFound("Document not found", code="DOCUMENT_NOT_FOUND")
        return await self.repo.list_for_document(document_id, status=status)

    async def update(self, entity_id: uuid.UUID, *, status: str, value: str | None,
                     version: int | None, actor) -> ExtractedEntity:
        if status not in ("confirmed", "corrected", "rejected"):
            raise ValidationFailed("Invalid status", code="VALIDATION_ERROR", http_status=422,
                                   field_errors={"status": "must be confirmed|corrected|rejected"})
        entity = await self.repo.get(entity_id)
        if entity is None:
            raise NotFound("Entity not found", code="ENTITY_NOT_FOUND")
        if version is not None and entity.version != version:
            raise VersionMismatch()
        before = {"status": entity.status, "value": entity.value}

        if status == "corrected" and value:
            entity.value = value
            entity.normalized_value = value
            # re-link equipment tags on correction
            if entity.entity_type == "equipment_tag":
                from app.modules.equipment.repository import normalize_tag
                from app.modules.equipment.service import EquipmentService

                entity.normalized_value = normalize_tag(value)
                matches = await EquipmentService(self.session, self.tenant_id).resolve(value)
                if matches:
                    entity.normalized_value = matches[0]["tag"]
                    entity.linked_record_type = "equipment"
                    entity.linked_record_id = uuid.UUID(str(matches[0]["id"]))
        elif status == "rejected":
            entity.linked_record_type = None
            entity.linked_record_id = None

        entity.status = status
        entity.version += 1
        entity.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="entity.review", entity_type="extracted_entity",
                               entity_id=entity.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               before=before, after={"status": status})
        return entity
