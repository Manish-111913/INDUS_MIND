"""Dashboard HTTP router (docs/02 §21).

Every authenticated user gets their role-resolved dashboard; per-widget
permission filtering happens in the service. `widgets/{key}/data` forwards the
query string as widget params (e.g. `?role=Plant+Manager`).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.responses import success
from app.core.database import get_session
from app.modules.auth.dependencies import CurrentUser, get_current_user
from app.modules.dashboards.schemas import ConfigSave
from app.modules.dashboards.service import DashboardService

router = APIRouter(prefix="/dashboards", tags=["dashboards"])


@router.get("/config", summary="Role-resolved dashboard config (+ personal override)")
async def get_config(actor: CurrentUser = Depends(get_current_user),
                     session: AsyncSession = Depends(get_session)) -> dict:
    data = await DashboardService(session, actor.tenant_id).config(actor)
    return success(data)


@router.put("/config", summary="Save personal dashboard layout override")
async def put_config(body: ConfigSave,
                     actor: CurrentUser = Depends(get_current_user),
                     session: AsyncSession = Depends(get_session)) -> dict:
    layout = [item.model_dump() for item in body.layout]
    data = await DashboardService(session, actor.tenant_id).save_config(actor, layout=layout)
    return success(data)


@router.get("/widgets", summary="Widget registry (permission-filtered)")
async def list_widgets(actor: CurrentUser = Depends(get_current_user),
                       session: AsyncSession = Depends(get_session)) -> dict:
    widgets = await DashboardService(session, actor.tenant_id).widgets(actor)
    return success(widgets)


@router.get("/widgets/{key}/data", summary="Live widget data (Redis-cached)")
async def widget_data(key: str, request: Request,
                      actor: CurrentUser = Depends(get_current_user),
                      session: AsyncSession = Depends(get_session)) -> dict:
    params = dict(request.query_params)
    data = await DashboardService(session, actor.tenant_id).widget_data(key, actor, params)
    return success(data)
