"""AI HTTP router — one-shot query, insights, evals (docs/02 §15)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.responses import success
from app.core.database import get_session
from app.modules.ai import cache
from app.modules.ai.copilot import CopilotService
from app.modules.ai.evals import load_questions, run_evals
from app.modules.ai.insights_service import InsightsService
from app.modules.ai.models import EvalRun
from app.modules.ai.schemas import AIQueryRequest, AIQueryResponse, EvalRunRead, InsightRead
from app.modules.ai.chat_service import scope_from_dict
from app.core.exceptions import NotFound
from app.modules.auth.dependencies import CurrentUser, require

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/query", summary="One-shot RAG query (non-streamed)")
async def ai_query(body: AIQueryRequest,
                   actor: CurrentUser = Depends(require("copilot.use")),
                   session: AsyncSession = Depends(get_session)) -> dict:
    cached = await cache.lookup(actor.tenant_id, body.query, body.scope)
    if cached is not None:
        return success(AIQueryResponse(
            answer=cached["answer"], citations=cached["citations"],
            confidence=cached["confidence"], latency_ms=cached.get("latency_ms", 0),
            cached=True).model_dump())

    result = await CopilotService(session, actor.tenant_id).run(
        body.query, scope=scope_from_dict(body.scope))
    payload = {"answer": result.answer, "citations": result.citations,
               "confidence": result.confidence, "latency_ms": result.latency_ms}
    await cache.store(actor.tenant_id, body.query, body.scope, payload)
    return success(AIQueryResponse(**payload, cached=False).model_dump())


@router.get("/insights", summary="Dashboard AI insight cards")
async def insights(role: str | None = Query(None),
                   actor: CurrentUser = Depends(require("copilot.use")),
                   session: AsyncSession = Depends(get_session)) -> dict:
    rows = await InsightsService(session, actor.tenant_id).list(role=role)
    return success([InsightRead.model_validate(r).model_dump() for r in rows])


@router.get("/evals/questions", summary="List benchmark questions")
async def eval_questions(actor: CurrentUser = Depends(require("copilot.use"))) -> dict:
    return success({"questions": load_questions()})


@router.post("/evals/run", summary="Run the benchmark → scores (judging metrics)")
async def eval_run(actor: CurrentUser = Depends(require("copilot.use")),
                   session: AsyncSession = Depends(get_session)) -> dict:
    report = await run_evals(session, actor.tenant_id, persist=True)
    return success(report)


@router.get("/evals/runs/{run_id}", summary="Get an eval run")
async def eval_run_detail(run_id: uuid.UUID,
                          actor: CurrentUser = Depends(require("copilot.use")),
                          session: AsyncSession = Depends(get_session)) -> dict:
    row = (await session.execute(
        select(EvalRun).where(EvalRun.id == run_id,
                              EvalRun.tenant_id == actor.tenant_id))).scalar_one_or_none()
    if row is None:
        raise NotFound("Eval run not found", code="EVAL_RUN_NOT_FOUND")
    return success(EvalRunRead.model_validate(row).model_dump())
