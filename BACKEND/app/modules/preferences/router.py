"""Preferences & saved-views router (docs/05 S2).

`/me/preferences/{key}` is per-user (any authenticated user manages only their
own). Saved views: reads return own + shared; writes are owner-only unless the
caller holds `views.manage`.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.responses import success
from app.core.database import get_session
from app.modules.auth.dependencies import CurrentUser, get_current_user
from app.modules.preferences.schemas import (
    PreferenceWrite,
    SavedViewCreate,
    SavedViewRead,
    SavedViewUpdate,
)
from app.modules.preferences.service import PreferenceService, SavedViewService

router = APIRouter(tags=["preferences"])


@router.get("/me/preferences/{key}", summary="Get a personal preference")
async def get_preference(
    key: str,
    current: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    value = await PreferenceService(session, current.tenant_id).get(current.id, key)
    return success({"key": key, "value": value})


@router.put("/me/preferences/{key}", summary="Upsert a personal preference")
async def put_preference(
    key: str, body: PreferenceWrite,
    current: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    value = await PreferenceService(session, current.tenant_id).set(current.id, key, body.value)
    return success({"key": key, "value": value})


def _view(row) -> dict:
    return SavedViewRead.model_validate(row).model_dump()


@router.get("/saved-views", summary="List my + shared saved views")
async def list_views(
    entity: str | None = Query(None),
    current: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    rows = await SavedViewService(session, current.tenant_id).list(current.id, entity)
    return success([_view(r) for r in rows])


@router.post("/saved-views", status_code=201, summary="Create a saved view")
async def create_view(
    body: SavedViewCreate,
    current: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    row = await SavedViewService(session, current.tenant_id).create(actor=current, data=body)
    return success(_view(row))


@router.patch("/saved-views/{view_id}", summary="Update a saved view")
async def update_view(
    view_id: uuid.UUID, body: SavedViewUpdate,
    current: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    row = await SavedViewService(session, current.tenant_id).update(view_id, actor=current, data=body)
    return success(_view(row))


@router.delete("/saved-views/{view_id}", summary="Delete a saved view")
async def delete_view(
    view_id: uuid.UUID,
    current: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    await SavedViewService(session, current.tenant_id).delete(view_id, actor=current)
    return success({"message": "Saved view deleted"})
