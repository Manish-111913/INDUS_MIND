"""AI config / prompt repositories (docs/02 §37, §38).

Resolution prefers a tenant-specific active row, falling back to the global
(tenant_id NULL) default.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ai.models import AIModelConfig, PromptTemplate


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
