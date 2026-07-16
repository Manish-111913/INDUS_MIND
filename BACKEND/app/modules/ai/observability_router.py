"""AI observability admin router (docs/05 S4).

Cost/token/latency summary + down-voted answer review. Guarded by
`ai.observability.view`. Aggregation is pure SQL (see AIObservabilityRepository);
routers stay thin.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.responses import success
from app.core.database import get_session
from app.modules.ai.repository import AIObservabilityRepository
from app.modules.auth.dependencies import CurrentUser, require

router = APIRouter(prefix="/admin", tags=["ai-observability"])


@router.get("/ai-usage/summary", summary="AI usage/cost summary (admin)")
async def ai_usage_summary(
    group_by: str = Query("feature", pattern=r"^(day|feature|model)$"),
    date_from: datetime | None = Query(None, alias="from"),
    date_to: datetime | None = Query(None, alias="to"),
    actor: CurrentUser = Depends(require("ai.observability.view")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    repo = AIObservabilityRepository(session, actor.tenant_id)
    rows = await repo.usage_summary(group_by=group_by, date_from=date_from, date_to=date_to)
    totals = {
        "calls": sum(r["calls"] for r in rows),
        "total_tokens": sum(r["total_tokens"] for r in rows),
        "cost_usd": round(sum(r["cost_usd"] for r in rows), 6),
    }
    return success({"group_by": group_by, "totals": totals, "series": rows})


@router.get("/ai-feedback", summary="AI answer feedback, e.g. down-votes (admin)")
async def ai_feedback(
    rating: str | None = Query(None, pattern=r"^(up|down)$"),
    actor: CurrentUser = Depends(require("ai.observability.view")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    rows = await AIObservabilityRepository(session, actor.tenant_id).feedback_list(rating=rating)
    return success(rows)
