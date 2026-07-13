"""AI insight cards for dashboards (docs/02 §15 GET /ai/insights, §21).

Cards are populated by agents/schedulers (B later); this serves them, filtered
by the requesting role (role-scoped or global).
"""

from __future__ import annotations

import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ai.models import AIInsight


class InsightsService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    async def list(self, *, role: str | None = None) -> list[AIInsight]:
        stmt = select(AIInsight).where(
            AIInsight.tenant_id == self.tenant_id, AIInsight.active.is_(True),
            AIInsight.deleted_at.is_(None))
        if role:
            stmt = stmt.where(or_(AIInsight.role == role, AIInsight.role.is_(None)))
        return list((await self.session.execute(stmt.order_by(AIInsight.created_at.desc()))).scalars())
