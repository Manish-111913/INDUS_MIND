"""RCA agent HTTP router (docs/02 §15).

`POST /ai/rca/{failure_id}/run` runs the agent (publishing WS progress) and
returns the draft analysis; `GET /ai/rca/{failure_id}` fetches the latest.
Human-in-the-loop edits go to `PATCH /ai/rca/analyses/{id}`; publishing (rca.publish)
emits a lessons-learned candidate and can spawn corrective work orders.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.responses import success
from app.core.database import get_session
from app.modules.ai.rca_agent import RCAService
from app.modules.ai.schemas import RCAPublish, RCARead, RCAUpdate
from app.modules.auth.dependencies import CurrentUser, require

router = APIRouter(prefix="/ai/rca", tags=["ai-rca"])


@router.post("/{failure_id}/run", summary="Run the RCA agent on a failure")
async def run_rca(failure_id: uuid.UUID,
                  actor: CurrentUser = Depends(require("rca.run")),
                  session: AsyncSession = Depends(get_session)) -> dict:
    analysis = await RCAService(session, actor.tenant_id).run(failure_id, actor=actor)
    return success(RCARead.model_validate(analysis).model_dump())


@router.get("/{failure_id}", summary="Latest RCA for a failure")
async def get_rca(failure_id: uuid.UUID,
                  actor: CurrentUser = Depends(require("rca.run")),
                  session: AsyncSession = Depends(get_session)) -> dict:
    analysis = await RCAService(session, actor.tenant_id).get_latest(failure_id)
    return success(RCARead.model_validate(analysis).model_dump())


@router.patch("/analyses/{analysis_id}", summary="Human edits to an RCA")
async def update_rca(analysis_id: uuid.UUID, body: RCAUpdate,
                     actor: CurrentUser = Depends(require("rca.run")),
                     session: AsyncSession = Depends(get_session)) -> dict:
    analysis = await RCAService(session, actor.tenant_id).update(analysis_id, data=body, actor=actor)
    return success(RCARead.model_validate(analysis).model_dump())


@router.post("/analyses/{analysis_id}/publish", summary="Publish RCA → lessons candidate + CAPA WOs")
async def publish_rca(analysis_id: uuid.UUID, body: RCAPublish | None = None,
                      actor: CurrentUser = Depends(require("rca.publish")),
                      session: AsyncSession = Depends(get_session)) -> dict:
    spawn = body.spawn_work_orders if body else True
    analysis = await RCAService(session, actor.tenant_id).publish(
        analysis_id, spawn_work_orders=spawn, actor=actor)
    return success(RCARead.model_validate(analysis).model_dump())
