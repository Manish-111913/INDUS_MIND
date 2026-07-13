"""Extracted-entity endpoints (docs/02 §17).

`GET /documents/{id}/entities` (doc.read) and `PATCH /entities/{id}`
(doc.update — the human-in-the-loop correction that re-links on correct).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.responses import success
from app.core.database import get_session
from app.modules.auth.dependencies import CurrentUser, require
from app.modules.ingestion.schemas import EntityRead, EntityUpdate
from app.modules.ingestion.service import EntityService

router = APIRouter(tags=["entities"])


@router.get("/documents/{document_id}/entities", summary="Extracted entities for a document")
async def list_entities(document_id: uuid.UUID, status: str | None = Query(None),
                        actor: CurrentUser = Depends(require("doc.read")),
                        session: AsyncSession = Depends(get_session)) -> dict:
    rows = await EntityService(session, actor.tenant_id).list_for_document(document_id, status=status)
    return success([EntityRead.model_validate(e).model_dump() for e in rows])


@router.patch("/entities/{entity_id}", summary="Confirm / correct / reject an entity")
async def update_entity(entity_id: uuid.UUID, body: EntityUpdate,
                        actor: CurrentUser = Depends(require("doc.update")),
                        session: AsyncSession = Depends(get_session)) -> dict:
    entity = await EntityService(session, actor.tenant_id).update(
        entity_id, status=body.status, value=body.value, version=body.version, actor=actor)
    return success(EntityRead.model_validate(entity).model_dump())
