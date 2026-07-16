"""Settings HTTP router (docs/05 S1).

`GET /settings/effective` is available to any authenticated user (the app shell
needs locale/units/branding at boot). Admin get/put of scoped overrides is gated
by `settings.manage`.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.responses import success
from app.core.database import get_session
from app.modules.auth.dependencies import CurrentUser, get_current_user, require
from app.modules.settings.schemas import DefinitionRead, SettingValueWrite
from app.modules.settings.service import SettingsService

router = APIRouter(tags=["settings"])


@router.get("/settings/effective", summary="Effective settings for the caller")
async def get_effective(
    plant_id: uuid.UUID | None = Query(None),
    current: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    values = await SettingsService(session, current.tenant_id).effective(current.id, plant_id)
    return success(values)


@router.get("/settings", summary="Definitions + values at a scope (admin)")
async def get_settings(
    scope: str = Query("tenant", pattern=r"^(tenant|plant|user)$"),
    scope_id: uuid.UUID | None = Query(None),
    actor: CurrentUser = Depends(require("settings.manage")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    svc = SettingsService(session, actor.tenant_id)
    resolved_scope_id = scope_id or (actor.tenant_id if scope == "tenant" else None)
    definitions = await svc.list_definitions()
    values = await svc.values_at_scope(scope, resolved_scope_id)
    return success({
        "scope": scope,
        "scope_id": str(resolved_scope_id) if resolved_scope_id else None,
        "definitions": [DefinitionRead.model_validate(d).model_dump() for d in definitions],
        "values": values,
    })


@router.put("/settings", summary="Set a setting value at a scope (admin)")
async def put_setting(
    body: SettingValueWrite,
    actor: CurrentUser = Depends(require("settings.manage")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    row = await SettingsService(session, actor.tenant_id).set_value(
        key=body.key, scope=body.scope, scope_id=body.scope_id, value=body.value, actor=actor)
    return success({"id": str(row.id), "key": body.key, "scope": body.scope, "value": row.value})
