"""AI config / prompt repositories (docs/02 §37, §38).

Resolution prefers a tenant-specific active row, falling back to the global
(tenant_id NULL) default.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ai.models import AIFeedback, AIModelConfig, AIUsage, ChatMessage, PromptTemplate


class AIConfigRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def active_for_capability(self, tenant_id: uuid.UUID | str | None,
                                    capability: str) -> AIModelConfig | None:
        stmt = (
            select(AIModelConfig)
            .where(AIModelConfig.capability == capability, AIModelConfig.active.is_(True),
                   AIModelConfig.deleted_at.is_(None))
            .where((AIModelConfig.tenant_id == tenant_id) | (AIModelConfig.tenant_id.is_(None)))
            # tenant-specific first (NULLs last)
            .order_by(AIModelConfig.tenant_id.desc().nulls_last())
        )
        return (await self.session.execute(stmt)).scalars().first()

    async def list_all(self, tenant_id: uuid.UUID | str | None) -> list[AIModelConfig]:
        stmt = select(AIModelConfig).where(
            AIModelConfig.deleted_at.is_(None),
            (AIModelConfig.tenant_id == tenant_id) | (AIModelConfig.tenant_id.is_(None)),
        )
        return list((await self.session.execute(stmt)).scalars().all())


class PromptRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def active(self, tenant_id: uuid.UUID | str | None, key: str) -> PromptTemplate | None:
        stmt = (
            select(PromptTemplate)
            .where(PromptTemplate.key == key, PromptTemplate.active.is_(True),
                   PromptTemplate.deleted_at.is_(None))
            .where((PromptTemplate.tenant_id == tenant_id) | (PromptTemplate.tenant_id.is_(None)))
            .order_by(PromptTemplate.tenant_id.desc().nulls_last(),
                      PromptTemplate.version.desc())
        )
        return (await self.session.execute(stmt)).scalars().first()


class AIObservabilityRepository:
    """AI usage aggregates + feedback list for the observability dashboard (docs/05 S4)."""

    _GROUPS = ("day", "feature", "model")

    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    async def usage_summary(self, *, group_by: str, date_from=None, date_to=None) -> list[dict]:
        from sqlalchemy import Integer, func

        if group_by not in self._GROUPS:
            group_by = "feature"
        tokens = AIUsage.prompt_tokens + AIUsage.completion_tokens
        key: Any  # a SQL expression — concrete type varies by grouping
        if group_by == "day":
            key = func.date_trunc("day", AIUsage.created_at)
        elif group_by == "model":
            key = AIUsage.model_name
        else:
            key = AIUsage.feature
        # Pure SQL aggregation — no Python-side loop over raw rows (docs/05 S4).
        stmt = select(
            key.label("bucket"),
            func.count().label("calls"),
            func.coalesce(func.sum(AIUsage.prompt_tokens), 0).label("prompt_tokens"),
            func.coalesce(func.sum(AIUsage.completion_tokens), 0).label("completion_tokens"),
            func.coalesce(func.sum(tokens), 0).label("total_tokens"),
            func.coalesce(func.sum(AIUsage.cost_usd), 0).label("cost_usd"),
            func.coalesce(func.avg(AIUsage.latency_ms), 0).label("avg_latency_ms"),
            func.coalesce(func.sum(func.cast(AIUsage.cache_hit, Integer)), 0).label("cache_hits"),
        ).where(AIUsage.tenant_id == self.tenant_id).group_by(key).order_by(key)
        if date_from is not None:
            stmt = stmt.where(AIUsage.created_at >= date_from)
        if date_to is not None:
            stmt = stmt.where(AIUsage.created_at <= date_to)
        rows = (await self.session.execute(stmt)).all()
        return [{
            "bucket": (r.bucket.date().isoformat()
                       if group_by == "day" and r.bucket else str(r.bucket)),
            "calls": int(r.calls),
            "prompt_tokens": int(r.prompt_tokens),
            "completion_tokens": int(r.completion_tokens),
            "total_tokens": int(r.total_tokens),
            "cost_usd": round(float(r.cost_usd), 6),
            "avg_latency_ms": round(float(r.avg_latency_ms), 1),
            "cache_hits": int(r.cache_hits),
        } for r in rows]

    async def feedback_list(self, *, rating: str | None) -> list[dict]:
        from sqlalchemy import and_
        from sqlalchemy.orm import aliased

        answer_msg = aliased(ChatMessage)
        user_msg = aliased(ChatMessage)
        # Correlated subquery: the latest user question preceding the rated answer.
        q_subq = (
            select(user_msg.content)
            .where(and_(user_msg.session_id == answer_msg.session_id,
                        user_msg.role == "user",
                        user_msg.created_at <= answer_msg.created_at))
            .order_by(user_msg.created_at.desc()).limit(1).scalar_subquery()
        )
        stmt = (
            select(AIFeedback.id, AIFeedback.rating, AIFeedback.reason_code, AIFeedback.comment,
                   AIFeedback.message_id, AIFeedback.created_at,
                   answer_msg.session_id.label("session_id"),
                   answer_msg.content.label("answer"),
                   q_subq.label("question"))
            .join(answer_msg, answer_msg.id == AIFeedback.message_id)
            .where(AIFeedback.tenant_id == self.tenant_id)
            .order_by(AIFeedback.created_at.desc())
        )
        if rating:
            stmt = stmt.where(AIFeedback.rating == rating)
        rows = (await self.session.execute(stmt)).all()
        return [{
            "id": str(r.id), "rating": r.rating, "reason_code": r.reason_code,
            "comment": r.comment, "message_id": str(r.message_id),
            "session_id": str(r.session_id), "session_link": f"/chat/sessions/{r.session_id}",
            "question": r.question, "answer": (r.answer or "")[:500],
            "created_at": r.created_at.isoformat() if r.created_at else None,
        } for r in rows]

    async def flagged_questions(self) -> list[str]:
        """Distinct question texts on down-voted answers — for eval augmentation (S4)."""
        seen: list[str] = []
        for r in await self.feedback_list(rating="down"):
            q = (r.get("question") or "").strip()
            if q and q not in seen:
                seen.append(q)
        return seen
