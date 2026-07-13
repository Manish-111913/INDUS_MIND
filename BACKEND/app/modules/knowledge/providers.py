"""Federated search-source registry (docs/02 §27).

The search endpoint federates over documents/equipment/graph (live here) plus
work-orders and regulations, which come from later modules. Those register a
`SearchSourceProvider` into this registry; until then they contribute nothing —
the seam exists now so B9/B10 light up without touching the search router.
"""

from __future__ import annotations

import uuid
from typing import Protocol

from sqlalchemy.ext.asyncio import AsyncSession


class SearchSourceProvider(Protocol):
    result_type: str    # e.g. "Work Orders" | "Regulations"
    suggest_category: str
    suggest_key: str    # key in the /search/suggest grouped object (e.g. "WorkOrders")

    async def search(self, session: AsyncSession, tenant_id: uuid.UUID | str,
                     query: str, limit: int) -> list[dict]: ...

    async def suggest(self, session: AsyncSession, tenant_id: uuid.UUID | str,
                      q: str, limit: int) -> list[dict]: ...


class FederatedSearchRegistry:
    def __init__(self) -> None:
        self._providers: list[SearchSourceProvider] = []

    def register(self, provider: SearchSourceProvider) -> None:
        self._providers.append(provider)

    async def search(self, session, tenant_id, query: str, types: set[str] | None,
                     limit: int) -> list[dict]:
        out: list[dict] = []
        for p in self._providers:
            if types and p.result_type not in types:
                continue
            try:
                out.extend(await p.search(session, tenant_id, query, limit))
            except Exception:  # noqa: BLE001 — one source must not break federated search
                pass
        return out

    async def suggest(self, session, tenant_id, q: str, limit: int) -> dict[str, list[dict]]:
        groups: dict[str, list[dict]] = {}
        for p in self._providers:
            try:
                groups[p.suggest_key] = await p.suggest(session, tenant_id, q, limit)
            except Exception:  # noqa: BLE001
                groups[p.suggest_key] = []
        return groups


federated_registry = FederatedSearchRegistry()
