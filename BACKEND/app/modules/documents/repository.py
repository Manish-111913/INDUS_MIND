"""Document repositories (docs/02 §7, §17, §50).

Tenant + soft-delete scoping on every query. `equipment_id` filtering is resolved
by the service to a set of document ids (via the entity-link provider) and passed
in — the repo never joins another module's tables (docs/02 §2).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from datetime import datetime

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams, PageResult, paginate
from app.modules.documents.models import Document, DocumentVersion, IngestionJob


class DocumentRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    def _base(self) -> Select:
        return select(Document).where(
            Document.tenant_id == self.tenant_id, Document.deleted_at.is_(None)
        )

    async def get(self, document_id: uuid.UUID | str) -> Document | None:
        return (
            await self.session.execute(self._base().where(Document.id == document_id))
        ).scalar_one_or_none()

    async def list(
        self, params: PageParams, *, doc_type_id: uuid.UUID | None = None,
        ingestion_status: str | None = None, tag: str | None = None,
        date_from: datetime | None = None, date_to: datetime | None = None,
        q: str | None = None, restrict_ids: Iterable[uuid.UUID] | None = None,
    ) -> PageResult:
        stmt = self._base()
        if doc_type_id:
            stmt = stmt.where(Document.doc_type_id == doc_type_id)
        if ingestion_status:
            stmt = stmt.where(Document.ingestion_status == ingestion_status)
        if tag:
            stmt = stmt.where(Document.tags.contains([tag]))
        if date_from:
            stmt = stmt.where(Document.created_at >= date_from)
        if date_to:
            stmt = stmt.where(Document.created_at <= date_to)
        if q:
            stmt = stmt.where(
                Document.search_vector.op("@@")(func.plainto_tsquery("english", q))
            )
        if restrict_ids is not None:
            ids = list(restrict_ids)
            stmt = stmt.where(Document.id.in_(ids) if ids else False)
        return await paginate(self.session, stmt, params, Document)

    async def add(self, document: Document) -> Document:
        document.tenant_id = self.tenant_id  # type: ignore[assignment]
        self.session.add(document)
        await self.session.flush()
        return document


class DocumentVersionRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    async def get(self, version_id: uuid.UUID | str) -> DocumentVersion | None:
        stmt = select(DocumentVersion).where(
            DocumentVersion.id == version_id, DocumentVersion.tenant_id == self.tenant_id
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list_for_document(self, document_id: uuid.UUID | str) -> list[DocumentVersion]:
        stmt = (
            select(DocumentVersion)
            .where(DocumentVersion.tenant_id == self.tenant_id,
                   DocumentVersion.document_id == document_id)
            .order_by(DocumentVersion.version_no.desc())
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def max_version_no(self, document_id: uuid.UUID | str) -> int:
        stmt = select(func.coalesce(func.max(DocumentVersion.version_no), 0)).where(
            DocumentVersion.document_id == document_id
        )
        return int((await self.session.execute(stmt)).scalar_one())

    async def add(self, version: DocumentVersion) -> DocumentVersion:
        version.tenant_id = self.tenant_id  # type: ignore[assignment]
        self.session.add(version)
        await self.session.flush()
        return version


class IngestionJobRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    async def get(self, job_id: uuid.UUID | str) -> IngestionJob | None:
        stmt = select(IngestionJob).where(
            IngestionJob.id == job_id, IngestionJob.tenant_id == self.tenant_id
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def latest_for_document(self, document_id: uuid.UUID | str) -> IngestionJob | None:
        stmt = (
            select(IngestionJob)
            .where(IngestionJob.tenant_id == self.tenant_id,
                   IngestionJob.document_id == document_id)
            .order_by(IngestionJob.created_at.desc())
            .limit(1)
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list(self, params: PageParams, *, status: str | None = None,
                   document_id: uuid.UUID | None = None) -> PageResult:
        stmt = select(IngestionJob).where(IngestionJob.tenant_id == self.tenant_id)
        if status:
            stmt = stmt.where(IngestionJob.status == status)
        if document_id:
            stmt = stmt.where(IngestionJob.document_id == document_id)
        return await paginate(self.session, stmt, params, IngestionJob)

    async def add(self, job: IngestionJob) -> IngestionJob:
        job.tenant_id = self.tenant_id  # type: ignore[assignment]
        self.session.add(job)
        await self.session.flush()
        return job
