"""Document ↔ entity link provider (docs/02 §2, §17).

Filtering documents by `equipment_id` requires the extracted-entity link that the
ingestion module (B5/B6) produces. This registry is the seam: until B5 registers
a real provider, the default resolves to an empty set (no links exist yet), so
the filter honestly returns nothing rather than joining a table that isn't there.
"""

from __future__ import annotations

import uuid
from typing import Protocol

from sqlalchemy.ext.asyncio import AsyncSession


class EntityLinkProvider(Protocol):
    async def documents_for_equipment(
        self, session: AsyncSession, tenant_id: uuid.UUID | str, equipment_id: uuid.UUID | str
    ) -> set[uuid.UUID]: ...


class _NullProvider:
    async def documents_for_equipment(self, session, tenant_id, equipment_id) -> set[uuid.UUID]:
        return set()


class EntityLinkRegistry:
    def __init__(self) -> None:
        self._provider: EntityLinkProvider = _NullProvider()

    def register(self, provider: EntityLinkProvider) -> None:
        self._provider = provider

    async def documents_for_equipment(
        self, session: AsyncSession, tenant_id: uuid.UUID | str, equipment_id: uuid.UUID | str
    ) -> set[uuid.UUID]:
        return await self._provider.documents_for_equipment(session, tenant_id, equipment_id)


entity_link_registry = EntityLinkRegistry()
