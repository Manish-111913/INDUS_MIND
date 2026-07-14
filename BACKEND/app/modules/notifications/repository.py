"""Notification repositories (docs/02 §7, §20)."""

from __future__ import annotations

import uuid

from sqlalchemy import Select, and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams, PageResult, paginate
from app.modules.notifications.models import (
    Notification,
    NotificationPreference,
    NotificationRule,
)


class NotificationRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    def _base(self, user_id: uuid.UUID | str) -> Select:
        return select(Notification).where(
            Notification.tenant_id == self.tenant_id, Notification.user_id == user_id)

    async def get(self, notification_id: uuid.UUID | str) -> Notification | None:
        return (await self.session.execute(select(Notification).where(
            Notification.id == notification_id,
            Notification.tenant_id == self.tenant_id))).scalar_one_or_none()

    async def list(self, user_id: uuid.UUID, params: PageParams, *, unread: bool | None = None,
                   priority: str | None = None, category: str | None = None) -> PageResult:
        stmt = self._base(user_id)
        if unread is True:
            stmt = stmt.where(Notification.read_at.is_(None))
        elif unread is False:
            stmt = stmt.where(Notification.read_at.is_not(None))
        if priority:
            stmt = stmt.where(Notification.priority == priority)
        if category:
            stmt = stmt.where(Notification.category == category)
        stmt = stmt.order_by(Notification.created_at.desc())
        return await paginate(self.session, stmt, params, Notification)

    async def unread_count(self, user_id: uuid.UUID) -> int:
        from sqlalchemy import func

        return (await self.session.execute(select(func.count()).select_from(Notification).where(
            Notification.tenant_id == self.tenant_id, Notification.user_id == user_id,
            Notification.read_at.is_(None)))).scalar() or 0

    async def add(self, notification: Notification) -> Notification:
        notification.tenant_id = self.tenant_id  # type: ignore[assignment]
        self.session.add(notification)
        await self.session.flush()
        return notification

    async def mark_read(self, user_id: uuid.UUID, *, ids: list[uuid.UUID] | None,
                        all_: bool) -> int:
        from datetime import UTC, datetime

        cond = and_(Notification.tenant_id == self.tenant_id, Notification.user_id == user_id,
                    Notification.read_at.is_(None))
        if not all_:
            if not ids:
                return 0
            cond = and_(cond, Notification.id.in_(ids))
        result = await self.session.execute(
            update(Notification).where(cond).values(read_at=datetime.now(UTC)))
        return result.rowcount or 0


class PreferenceRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    async def for_user(self, user_id: uuid.UUID | str) -> list[NotificationPreference]:
        return list((await self.session.execute(select(NotificationPreference).where(
            NotificationPreference.tenant_id == self.tenant_id,
            NotificationPreference.user_id == user_id))).scalars().all())

    async def get(self, user_id, category: str, channel: str) -> NotificationPreference | None:
        return (await self.session.execute(select(NotificationPreference).where(
            NotificationPreference.tenant_id == self.tenant_id,
            NotificationPreference.user_id == user_id,
            NotificationPreference.category == category,
            NotificationPreference.channel == channel))).scalar_one_or_none()

    async def upsert(self, user_id, category: str, channel: str, enabled: bool) -> NotificationPreference:
        pref = await self.get(user_id, category, channel)
        if pref is None:
            pref = NotificationPreference(tenant_id=self.tenant_id, user_id=user_id,
                                          category=category, channel=channel, enabled=enabled)
            self.session.add(pref)
        else:
            pref.enabled = enabled
        await self.session.flush()
        return pref


class RuleRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    async def for_event(self, event_type: str) -> list[NotificationRule]:
        stmt = select(NotificationRule).where(
            NotificationRule.event_type == event_type, NotificationRule.active.is_(True),
            NotificationRule.deleted_at.is_(None),
            (NotificationRule.tenant_id == self.tenant_id) | (NotificationRule.tenant_id.is_(None)),
        ).order_by(NotificationRule.tenant_id.desc().nulls_last())
        rows = list((await self.session.execute(stmt)).scalars().all())
        # Tenant-specific rules override globals for the same event_type when present.
        if any(r.tenant_id is not None for r in rows):
            return [r for r in rows if r.tenant_id is not None]
        return rows
