"""Maintenance HTTP router (docs/02 §14, §18).

Permission gates (docs/01 §22): reads need `wo.read`; create `wo.create`; assign
`wo.assign`; transition `wo.create`; close `wo.close`; schedules/optimize/apply
`maint.schedule`; failures reads `wo.read`, writes `wo.close`. Special/static
routes are declared before `/{id}` routes so the id path doesn't shadow them.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams
from app.common.responses import success
from app.core.database import get_session
from app.modules.auth.dependencies import CurrentUser, require
from app.modules.maintenance import events as _events  # noqa: F401 — registers graph subscribers
from app.modules.maintenance import providers as _providers  # noqa: F401 — registers registries
from app.modules.maintenance.ai_context import AiContextService
from app.modules.maintenance.optimize import OptimizeService
from app.modules.maintenance.prediction_service import PredictionService
from app.modules.maintenance.schemas import (
    FailureCreate,
    FailureRead,
    FailureUpdate,
    PredictionDismiss,
    PredictionRead,
    ProposalRead,
    ScheduleCreate,
    ScheduleOptimize,
    ScheduleRead,
    ScheduleUpdate,
    WorkOrderAssign,
    WorkOrderClose,
    WorkOrderCreate,
    WorkOrderRead,
    WorkOrderTransition,
    WorkOrderUpdate,
)
from app.modules.maintenance.service import (
    FailureService,
    MetricsService,
    ScheduleService,
    WorkOrderService,
)

router = APIRouter(tags=["maintenance"])


def _page(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
          sort: str | None = Query("-created_at")) -> PageParams:
    return PageParams(page=page, page_size=page_size, sort=sort)


# ── schedules (static prefix before /work-orders/{id}) ───────────────────────
@router.get("/maintenance/schedules", summary="List maintenance schedules")
async def list_schedules(params: PageParams = Depends(_page),
                         equipment_id: uuid.UUID | None = Query(None),
                         active: bool | None = Query(None),
                         actor: CurrentUser = Depends(require("wo.read")),
                         session: AsyncSession = Depends(get_session)) -> dict:
    page = await ScheduleService(session, actor.tenant_id).list(
        params, equipment_id=equipment_id, active=active)
    return success([ScheduleRead.model_validate(s).model_dump() for s in page.items], meta=page.meta)


@router.post("/maintenance/schedules", status_code=201, summary="Create a maintenance schedule")
async def create_schedule(body: ScheduleCreate,
                          actor: CurrentUser = Depends(require("maint.schedule")),
                          session: AsyncSession = Depends(get_session)) -> dict:
    schedule = await ScheduleService(session, actor.tenant_id).create(data=body, actor=actor)
    return success(ScheduleRead.model_validate(schedule).model_dump())


@router.get("/maintenance/schedules/{schedule_id}", summary="Get a maintenance schedule")
async def get_schedule(schedule_id: uuid.UUID,
                       actor: CurrentUser = Depends(require("wo.read")),
                       session: AsyncSession = Depends(get_session)) -> dict:
    schedule = await ScheduleService(session, actor.tenant_id).get(schedule_id)
    return success(ScheduleRead.model_validate(schedule).model_dump())


@router.patch("/maintenance/schedules/{schedule_id}", summary="Update a maintenance schedule")
async def update_schedule(schedule_id: uuid.UUID, body: ScheduleUpdate,
                          actor: CurrentUser = Depends(require("maint.schedule")),
                          session: AsyncSession = Depends(get_session)) -> dict:
    schedule = await ScheduleService(session, actor.tenant_id).update(
        schedule_id, data=body, actor=actor)
    return success(ScheduleRead.model_validate(schedule).model_dump())


@router.delete("/maintenance/schedules/{schedule_id}", summary="Delete a maintenance schedule")
async def delete_schedule(schedule_id: uuid.UUID,
                          actor: CurrentUser = Depends(require("maint.schedule")),
                          session: AsyncSession = Depends(get_session)) -> dict:
    await ScheduleService(session, actor.tenant_id).delete(schedule_id, actor=actor)
    return success({"message": "Schedule deleted"})


@router.post("/maintenance/schedules/optimize", summary="LLM schedule-optimization proposal")
async def optimize_schedules(body: ScheduleOptimize,
                             actor: CurrentUser = Depends(require("maint.schedule")),
                             session: AsyncSession = Depends(get_session)) -> dict:
    proposal = await OptimizeService(session, actor.tenant_id).optimize(scope=body.scope, actor=actor)
    return success(ProposalRead.model_validate(proposal).model_dump())


@router.post("/maintenance/proposals/{proposal_id}/apply", summary="Apply an optimization proposal")
async def apply_proposal(proposal_id: uuid.UUID,
                         actor: CurrentUser = Depends(require("maint.schedule")),
                         session: AsyncSession = Depends(get_session)) -> dict:
    proposal = await OptimizeService(session, actor.tenant_id).apply(proposal_id, actor=actor)
    return success(ProposalRead.model_validate(proposal).model_dump())


# ── predictions (docs/02 §14, §15) ───────────────────────────────────────────
@router.get("/maintenance/predictions", summary="Risk-ranked predictive-maintenance list")
async def list_predictions(params: PageParams = Depends(_page),
                           status: str | None = Query(None),
                           risk_band: str | None = Query(None),
                           equipment_id: uuid.UUID | None = Query(None),
                           actor: CurrentUser = Depends(require("wo.read")),
                           session: AsyncSession = Depends(get_session)) -> dict:
    page = await PredictionService(session, actor.tenant_id).list(
        params, status=status, risk_band=risk_band, equipment_id=equipment_id)
    return success([PredictionRead.model_validate(p).model_dump() for p in page.items],
                   meta=page.meta)


@router.post("/maintenance/predictions/refresh", summary="Recompute predictions now")
async def refresh_predictions(actor: CurrentUser = Depends(require("maint.predict.act")),
                              session: AsyncSession = Depends(get_session)) -> dict:
    created = await PredictionService(session, actor.tenant_id).refresh(actor=actor)
    return success({"refreshed": len(created)})


@router.post("/maintenance/predictions/{prediction_id}/accept",
             summary="Accept a prediction → create a work order")
async def accept_prediction(prediction_id: uuid.UUID,
                            actor: CurrentUser = Depends(require("maint.predict.act")),
                            session: AsyncSession = Depends(get_session)) -> dict:
    pred, wo_id = await PredictionService(session, actor.tenant_id).accept(prediction_id, actor=actor)
    data = PredictionRead.model_validate(pred).model_dump()
    data["work_order_id"] = str(wo_id)
    return success(data)


@router.post("/maintenance/predictions/{prediction_id}/dismiss",
             summary="Dismiss a prediction with a reason (feedback loop)")
async def dismiss_prediction(prediction_id: uuid.UUID, body: PredictionDismiss,
                             actor: CurrentUser = Depends(require("maint.predict.act")),
                             session: AsyncSession = Depends(get_session)) -> dict:
    pred = await PredictionService(session, actor.tenant_id).dismiss(
        prediction_id, reason=body.reason, actor=actor)
    return success(PredictionRead.model_validate(pred).model_dump())


# ── metrics ──────────────────────────────────────────────────────────────────
@router.get("/maintenance/metrics", summary="MTBF / MTTR / PM-compliance / backlog")
async def maintenance_metrics(equipment_id: uuid.UUID | None = Query(None),
                              area_id: uuid.UUID | None = Query(None),
                              actor: CurrentUser = Depends(require("wo.read")),
                              session: AsyncSession = Depends(get_session)) -> dict:
    metrics = await MetricsService(session, actor.tenant_id).compute(
        equipment_id=equipment_id, area_id=area_id)
    return success(metrics)


# ── failures ─────────────────────────────────────────────────────────────────
@router.get("/failures", summary="List failure records")
async def list_failures(params: PageParams = Depends(_page),
                        equipment_id: uuid.UUID | None = Query(None),
                        failure_mode_id: uuid.UUID | None = Query(None),
                        actor: CurrentUser = Depends(require("wo.read")),
                        session: AsyncSession = Depends(get_session)) -> dict:
    page = await FailureService(session, actor.tenant_id).list(
        params, equipment_id=equipment_id, failure_mode_id=failure_mode_id)
    return success([FailureRead.model_validate(f).model_dump() for f in page.items], meta=page.meta)


@router.post("/failures", status_code=201, summary="Create a failure record")
async def create_failure(body: FailureCreate,
                         actor: CurrentUser = Depends(require("wo.close")),
                         session: AsyncSession = Depends(get_session)) -> dict:
    failure = await FailureService(session, actor.tenant_id).create(data=body, actor=actor)
    return success(FailureRead.model_validate(failure).model_dump())


@router.get("/failures/{failure_id}", summary="Get a failure record")
async def get_failure(failure_id: uuid.UUID,
                      actor: CurrentUser = Depends(require("wo.read")),
                      session: AsyncSession = Depends(get_session)) -> dict:
    failure = await FailureService(session, actor.tenant_id).get(failure_id)
    return success(FailureRead.model_validate(failure).model_dump())


@router.patch("/failures/{failure_id}", summary="Update a failure record")
async def update_failure(failure_id: uuid.UUID, body: FailureUpdate,
                         actor: CurrentUser = Depends(require("wo.close")),
                         session: AsyncSession = Depends(get_session)) -> dict:
    failure = await FailureService(session, actor.tenant_id).update(
        failure_id, data=body, actor=actor)
    return success(FailureRead.model_validate(failure).model_dump())


@router.delete("/failures/{failure_id}", summary="Delete a failure record")
async def delete_failure(failure_id: uuid.UUID,
                         actor: CurrentUser = Depends(require("wo.close")),
                         session: AsyncSession = Depends(get_session)) -> dict:
    await FailureService(session, actor.tenant_id).delete(failure_id, actor=actor)
    return success({"message": "Failure record deleted"})


# ── work orders ──────────────────────────────────────────────────────────────
@router.get("/work-orders", summary="List work orders (frontend filter set)")
async def list_work_orders(
    params: PageParams = Depends(_page),
    status: str | None = Query(None),
    priority: str | None = Query(None),
    type: str | None = Query(None),
    assignee_id: uuid.UUID | None = Query(None),
    equipment_id: uuid.UUID | None = Query(None),
    area_id: uuid.UUID | None = Query(None),
    source: str | None = Query(None),
    due_from: datetime | None = Query(None),
    due_to: datetime | None = Query(None),
    q: str | None = Query(None),
    actor: CurrentUser = Depends(require("wo.read")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    page = await WorkOrderService(session, actor.tenant_id).list(
        params, status=status, priority=priority, type=type, assignee_id=assignee_id,
        equipment_id=equipment_id, area_id=area_id, source=source,
        due_from=due_from, due_to=due_to, q=q)
    return success([WorkOrderRead.model_validate(w).model_dump() for w in page.items], meta=page.meta)


@router.post("/work-orders", status_code=201, summary="Create a work order")
async def create_work_order(body: WorkOrderCreate,
                            actor: CurrentUser = Depends(require("wo.create")),
                            session: AsyncSession = Depends(get_session)) -> dict:
    wo = await WorkOrderService(session, actor.tenant_id).create(data=body, actor=actor)
    return success(WorkOrderRead.model_validate(wo).model_dump())


@router.get("/work-orders/{wo_id}", summary="Get a work order")
async def get_work_order(wo_id: uuid.UUID,
                         actor: CurrentUser = Depends(require("wo.read")),
                         session: AsyncSession = Depends(get_session)) -> dict:
    wo = await WorkOrderService(session, actor.tenant_id).get(wo_id)
    return success(WorkOrderRead.model_validate(wo).model_dump())


@router.patch("/work-orders/{wo_id}", summary="Update a work order")
async def update_work_order(wo_id: uuid.UUID, body: WorkOrderUpdate,
                            actor: CurrentUser = Depends(require("wo.create")),
                            session: AsyncSession = Depends(get_session)) -> dict:
    wo = await WorkOrderService(session, actor.tenant_id).update(wo_id, data=body, actor=actor)
    return success(WorkOrderRead.model_validate(wo).model_dump())


@router.delete("/work-orders/{wo_id}", summary="Delete a work order")
async def delete_work_order(wo_id: uuid.UUID,
                            actor: CurrentUser = Depends(require("wo.create")),
                            session: AsyncSession = Depends(get_session)) -> dict:
    await WorkOrderService(session, actor.tenant_id).delete(wo_id, actor=actor)
    return success({"message": "Work order deleted"})


@router.post("/work-orders/{wo_id}/assign", summary="Assign a work order")
async def assign_work_order(wo_id: uuid.UUID, body: WorkOrderAssign,
                            actor: CurrentUser = Depends(require("wo.assign")),
                            session: AsyncSession = Depends(get_session)) -> dict:
    wo = await WorkOrderService(session, actor.tenant_id).assign(
        wo_id, assignee_id=body.assignee_id, version=body.version, actor=actor)
    return success(WorkOrderRead.model_validate(wo).model_dump())


@router.post("/work-orders/{wo_id}/transition", summary="Transition WO status (state-machine)")
async def transition_work_order(wo_id: uuid.UUID, body: WorkOrderTransition,
                                actor: CurrentUser = Depends(require("wo.create")),
                                session: AsyncSession = Depends(get_session)) -> dict:
    wo = await WorkOrderService(session, actor.tenant_id).transition(
        wo_id, target=body.status, note=body.note, version=body.version, actor=actor)
    return success(WorkOrderRead.model_validate(wo).model_dump())


@router.post("/work-orders/{wo_id}/close", summary="Close a work order (+ optional failure)")
async def close_work_order(wo_id: uuid.UUID, body: WorkOrderClose,
                           actor: CurrentUser = Depends(require("wo.close")),
                           session: AsyncSession = Depends(get_session)) -> dict:
    wo = await WorkOrderService(session, actor.tenant_id).close(wo_id, data=body, actor=actor)
    return success(WorkOrderRead.model_validate(wo).model_dump())


@router.get("/work-orders/{wo_id}/ai-context", summary="Cited AI decision support for a WO")
async def work_order_ai_context(wo_id: uuid.UUID,
                                actor: CurrentUser = Depends(require("wo.read")),
                                session: AsyncSession = Depends(get_session)) -> dict:
    wo = await WorkOrderService(session, actor.tenant_id).get(wo_id)
    context = await AiContextService(session, actor.tenant_id).build(wo)
    return success(context.model_dump())
