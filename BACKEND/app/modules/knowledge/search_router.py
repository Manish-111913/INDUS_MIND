"""Search HTTP router (docs/02 §27).

Federated search + typeahead are available to any authenticated user (results are
tenant-scoped). Saved searches are per-user. Response shapes match the frontend
search contract exactly.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.responses import success
from app.core.database import get_session
from app.modules.auth.dependencies import CurrentUser, get_current_user
from app.modules.knowledge.retrieval import RetrievalScope
from app.modules.knowledge.schemas import SavedSearchCreate, SavedSearchRead
from app.modules.knowledge.search_service import SavedSearchService, SearchService

router = APIRouter(tags=["search"])


def _types(types: str | None) -> set[str] | None:
    return {t.strip() for t in types.split(",") if t.strip()} if types else None


@router.get("/search", summary="Federated search (documents, equipment, graph, WOs, regulations)")
async def search(
    q: str = Query(..., min_length=1),
    types: str | None = Query(None),
    plant_id: uuid.UUID | None = Query(None),
    doc_type: uuid.UUID | None = Query(None),
    equipment_id: uuid.UUID | None = Query(None),
    limit: int = Query(10, ge=1, le=50),
    current: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    scope = RetrievalScope(
        plant_ids=[plant_id] if plant_id else [],
        doc_type_ids=[doc_type] if doc_type else [],
        equipment_ids=[equipment_id] if equipment_id else [])
    result = await SearchService(session, current.tenant_id).search(
        q, types=_types(types), scope=scope, limit=limit)
    return success(result)


@router.get("/search/suggest", summary="Typeahead suggestions (⌘K command palette)")
async def suggest(
    q: str = Query("", description="prefix; empty returns defaults"),
    current: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    groups = await SearchService(session, current.tenant_id).suggest(q)
    return success(groups)


@router.get("/search/saved", summary="List my saved searches")
async def list_saved(current: CurrentUser = Depends(get_current_user),
                     session: AsyncSession = Depends(get_session)) -> dict:
    rows = await SavedSearchService(session, current.tenant_id).list(current.id)
    return success([SavedSearchRead.model_validate(r).model_dump() for r in rows])


@router.post("/search/saved", status_code=201, summary="Save a search")
async def create_saved(body: SavedSearchCreate,
                       current: CurrentUser = Depends(get_current_user),
                       session: AsyncSession = Depends(get_session)) -> dict:
    row = await SavedSearchService(session, current.tenant_id).create(
        user_id=current.id, name=body.name, query=body.query, filters=body.filters)
    return success(SavedSearchRead.model_validate(row).model_dump())


@router.delete("/search/saved/{saved_id}", summary="Delete a saved search")
async def delete_saved(saved_id: uuid.UUID,
                       current: CurrentUser = Depends(get_current_user),
                       session: AsyncSession = Depends(get_session)) -> dict:
    await SavedSearchService(session, current.tenant_id).delete(user_id=current.id, saved_id=saved_id)
    return success({"message": "Saved search deleted"})
