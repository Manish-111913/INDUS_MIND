"""Lookups HTTP router (docs/02 §27).

`GET /lookups/{category}` is available to any authenticated user (dropdowns are
needed everywhere). Admin CRUD is gated by `tenant.manage`.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.responses import success
from app.core.database import get_session
from app.modules.auth.dependencies import CurrentUser, get_current_user, require
from app.modules.lookups.schemas import LookupCreate, LookupRead, LookupUpdate
from app.modules.lookups.service import LookupService

router = APIRouter(tags=["lookups"])


def _read(row) -> dict:
    return LookupRead.model_validate(row).model_dump()


@router.get("/lookups/{category}", summary="Options for a dropdown category")
async def get_lookups(
    category: str,
    current: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    rows = await LookupService(session, current.tenant_id).by_category(category)
    return success([_read(r) for r in rows])


@router.post("/lookups", status_code=201, summary="Create a lookup (admin)")
async def create_lookup(
    body: LookupCreate,
    actor: CurrentUser = Depends(require("tenant.manage")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    row = await LookupService(session, actor.tenant_id).create(
        category=body.category, code=body.code, label=body.label, sort=body.sort,
        meta=body.meta, active=body.active, actor=actor)
    return success(_read(row))


@router.patch("/lookups/id/{lookup_id}", summary="Update a lookup (admin)")
async def update_lookup(
    lookup_id: uuid.UUID, body: LookupUpdate,
    actor: CurrentUser = Depends(require("tenant.manage")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    row = await LookupService(session, actor.tenant_id).update(lookup_id, data=body, actor=actor)
    return success(_read(row))


@router.delete("/lookups/id/{lookup_id}", summary="Delete a lookup (admin)")
async def delete_lookup(
    lookup_id: uuid.UUID,
    actor: CurrentUser = Depends(require("tenant.manage")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    await LookupService(session, actor.tenant_id).delete(lookup_id, actor=actor)
    return success({"message": "Lookup deleted"})
