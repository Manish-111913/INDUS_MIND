"""Chunk repository (docs/02 §7, §10). Idempotent writes keyed by chunk checksum."""

from __future__ import annotations

import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ingestion.models import DocumentChunk, ExtractedEntity


class ChunkRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    async def delete_for_version(self, version_id: uuid.UUID | str) -> None:
        await self.session.execute(
            delete(DocumentChunk).where(
                DocumentChunk.tenant_id == self.tenant_id,
                DocumentChunk.version_id == version_id,
            )
        )

    async def existing_checksums(self, version_id: uuid.UUID | str) -> set[str]:
        stmt = select(DocumentChunk.checksum).where(
            DocumentChunk.tenant_id == self.tenant_id, DocumentChunk.version_id == version_id
        )
        return set((await self.session.execute(stmt)).scalars().all())

    async def add_many(self, chunks: list[DocumentChunk]) -> None:
        for chunk in chunks:
            chunk.tenant_id = self.tenant_id  # type: ignore[assignment]
        self.session.add_all(chunks)
        await self.session.flush()

    async def count_for_document(self, document_id: uuid.UUID | str) -> int:
        stmt = select(func.count()).select_from(DocumentChunk).where(
            DocumentChunk.tenant_id == self.tenant_id, DocumentChunk.document_id == document_id
        )
        return int((await self.session.execute(stmt)).scalar_one())

    async def list_for_document(self, document_id: uuid.UUID | str) -> list[DocumentChunk]:
        stmt = (
            select(DocumentChunk)
            .where(DocumentChunk.tenant_id == self.tenant_id,
                   DocumentChunk.document_id == document_id)
            .order_by(DocumentChunk.chunk_index)
        )
        return list((await self.session.execute(stmt)).scalars().all())


class EntityRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    async def delete_for_document(self, document_id: uuid.UUID | str) -> None:
        await self.session.execute(
            delete(ExtractedEntity).where(
                ExtractedEntity.tenant_id == self.tenant_id,
                ExtractedEntity.document_id == document_id,
            )
        )

    async def add_many(self, rows: list[ExtractedEntity]) -> None:
        self.session.add_all(rows)
        await self.session.flush()

    async def get(self, entity_id: uuid.UUID | str) -> ExtractedEntity | None:
        stmt = select(ExtractedEntity).where(
            ExtractedEntity.id == entity_id, ExtractedEntity.tenant_id == self.tenant_id
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list_for_document(self, document_id: uuid.UUID | str,
                                *, status: str | None = None) -> list[ExtractedEntity]:
        stmt = select(ExtractedEntity).where(
            ExtractedEntity.tenant_id == self.tenant_id,
            ExtractedEntity.document_id == document_id,
        )
        if status:
            stmt = stmt.where(ExtractedEntity.status == status)
        stmt = stmt.order_by(ExtractedEntity.entity_type, ExtractedEntity.normalized_value)
        return list((await self.session.execute(stmt)).scalars().all())

    async def documents_for_equipment(self, equipment_id: uuid.UUID | str) -> set[uuid.UUID]:
        stmt = select(ExtractedEntity.document_id).where(
            ExtractedEntity.tenant_id == self.tenant_id,
            ExtractedEntity.linked_record_type == "equipment",
            ExtractedEntity.linked_record_id == equipment_id,
        )
        return set((await self.session.execute(stmt)).scalars().all())
