"""Provider registries for the 360° history + metrics (docs/02 §23, §2).

The unified equipment timeline and metrics aggregate across modules WITHOUT
cross-module table joins: each module registers a provider (a service interface)
that this module fans out to. Today the audit provider yields real lifecycle
events and a document provider is stubbed; maintenance/failures register their
providers when those modules land.
"""

from __future__ import annotations

import uuid
from typing import Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams
from app.core.logging import get_logger
from app.modules.equipment.schemas import TimelineEvent

log = get_logger("equipment.providers")


class HistoryProvider(Protocol):
    source: str

    async def fetch(
        self, session: AsyncSession, tenant_id: uuid.UUID | str, equipment_id: uuid.UUID | str
    ) -> list[TimelineEvent]: ...


class MetricsProvider(Protocol):
    async def fetch(
        self, session: AsyncSession, tenant_id: uuid.UUID | str, equipment_id: uuid.UUID | str
    ) -> dict: ...


class HistoryRegistry:
    def __init__(self) -> None:
        self._providers: list[HistoryProvider] = []

    def register(self, provider: HistoryProvider) -> None:
        self._providers.append(provider)

    async def collect(
        self, session: AsyncSession, tenant_id: uuid.UUID | str, equipment_id: uuid.UUID | str
    ) -> list[TimelineEvent]:
        events: list[TimelineEvent] = []
        for provider in self._providers:
            try:
                events.extend(await provider.fetch(session, tenant_id, equipment_id))
            except Exception as exc:  # noqa: BLE001 — one provider must not break the timeline
                log.error("history_provider_failed", source=getattr(provider, "source", "?"),
                          error=str(exc))
        events.sort(key=lambda e: e.timestamp, reverse=True)
        return events


class MetricsRegistry:
    def __init__(self) -> None:
        self._providers: list[MetricsProvider] = []

    def register(self, provider: MetricsProvider) -> None:
        self._providers.append(provider)

    async def collect(
        self, session: AsyncSession, tenant_id: uuid.UUID | str, equipment_id: uuid.UUID | str
    ) -> dict:
        merged: dict = {}
        for provider in self._providers:
            try:
                merged.update(await provider.fetch(session, tenant_id, equipment_id))
            except Exception as exc:  # noqa: BLE001
                log.error("metrics_provider_failed", error=str(exc))
        return merged


# ── built-in providers ───────────────────────────────────────────────────────
class AuditHistoryProvider:
    """Real lifecycle events from the append-only audit log (via the service)."""

    source = "audit"

    async def fetch(self, session, tenant_id, equipment_id) -> list[TimelineEvent]:
        from app.modules.audit.service import AuditService

        page = await AuditService(session).for_entity(
            tenant_id=tenant_id, entity_type="equipment", entity_id=str(equipment_id),
            params=PageParams(page=1, page_size=100, sort="-created_at"),
        )
        return [
            TimelineEvent(
                source="audit", type=row.action, title=_humanize(row.action),
                timestamp=row.created_at, actor_id=row.actor_id,
                ref_type="equipment", ref_id=str(equipment_id), payload=row.after or {},
            )
            for row in page.items
        ]


class DocumentHistoryProvider:
    """Stub until the documents module registers the real provider (docs/02 §23)."""

    source = "document"

    async def fetch(self, session, tenant_id, equipment_id) -> list[TimelineEvent]:
        return []


def _humanize(action: str) -> str:
    return action.replace("equipment.", "Equipment ").replace(".", " ").replace("_", " ").title()


# Process-wide registries; other modules import and register into these.
history_registry = HistoryRegistry()
metrics_registry = MetricsRegistry()
history_registry.register(AuditHistoryProvider())
history_registry.register(DocumentHistoryProvider())
