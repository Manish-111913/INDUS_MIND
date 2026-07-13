"""Chunk repository (docs/02 §7, §10). Idempotent writes keyed by chunk checksum."""

from __future__ import annotations

import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ingestion.models import DocumentChunk


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
