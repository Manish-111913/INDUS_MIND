"""Notification service: routing, delivery, inbox, preferences (docs/02 §20, §34).

`NotificationRouter.route(event)` is the event-bus entrypoint: it loads the DB
routing rules for the event type, resolves each rule's audience (assignee / actor
/ role / subscribers), and delivers one notification per user across the rule's
channels — gated by that user's preferences. Delivery persists an in-app row +
WS `notification.new`, sends email (mailhog) and a push stub. `NotificationService`
serves the inbox / mark-read / preferences / broadcast HTTP surface.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams, PageResult
from app.core.logging import get_logger
from app.modules.auth.models import User
from app.modules.notifications import senders
from app.modules.notifications.models import Notification
from app.modules.notifications.repository import (
    NotificationRepository,
    PreferenceRepository,
    RuleRepository,
)
from app.modules.users.models import Role, UserRole

log = get_logger("notifications.service")

# Default per-channel enablement when a user has no explicit preference row.
_HIGH = {"high", "critical"}
# Fallback audience by category for generic `notification.created` events (no rule).
_CATEGORY_AUDIENCE = {
    "maintenance": ["role:Maintenance Engineer", "role:Plant Manager"],
    "compliance": ["role:Compliance Officer", "role:Plant Manager"],
    "safety_alert": ["role:Plant Manager", "role:Field Technician"],
}


def _default_enabled(channel: str, priority: str) -> bool:
    if channel == "in_app":
        return True
    if channel == "email":
        return priority in _HIGH
    return False  # push off by default


class NotificationRouter:
    """Event-bus subscriber — resolves rules → audience → per-channel delivery."""

    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = NotificationRepository(session, tenant_id)
        self.prefs = PreferenceRepository(session, tenant_id)
        self.rules = RuleRepository(session, tenant_id)

    async def route(self, event_type: str, *, payload: dict, actor_id: str | None) -> int:
        rules = await self.rules.for_event(event_type)
        synthesized = False
        if not rules and event_type == "notification.created":
            rules = [self._synthetic_rule(payload)]
            synthesized = True
        delivered = 0
        for rule in rules:
            category = payload.get("category") or rule.category
            priority = payload.get("priority") or rule.priority
            title = payload.get("title") or _render(rule.title_template, payload) or category
            body = payload.get("body")
            entity_type = payload.get("entity_type")
            entity_id = payload.get("entity_id")
            channels = payload.get("channels") or rule.channels or ["in_app"]
            audience = payload.get("audience") or rule.audience
            user_ids = await self._resolve_audience(audience, payload, actor_id)
            for user_id in user_ids:
                await self.deliver(user_id=user_id, category=category, priority=priority,
                                   title=title, body=body, entity_type=entity_type,
                                   entity_id=entity_id, channels=channels)
                delivered += 1
        if delivered or synthesized:
            log.info("notifications_routed", event_type=event_type, delivered=delivered)
        return delivered

    def _synthetic_rule(self, payload: dict):
        from app.modules.notifications.models import NotificationRule

        category = payload.get("category", "system")
        return NotificationRule(
            tenant_id=None, event_type="notification.created", category=category,
            priority=payload.get("priority", "normal"),
            audience=_CATEGORY_AUDIENCE.get(category, ["role:Plant Manager"]),
            channels=["in_app"], active=True)

    async def deliver(self, *, user_id, category, priority, title, body, entity_type,
                      entity_id, channels) -> Notification:
        notification = await self.repo.add(Notification(
            user_id=_uuid(user_id), category=category, priority=priority, title=title[:512],
            body=body, entity_type=entity_type, entity_id=_uuid(entity_id) if entity_id else None,
            channels_sent=[]))
        sent: list[str] = []
        # in_app is implicit (the row itself) + WS push.
        if await senders.send_in_app(notification):
            sent.append("in_app")
        user = await self._user(user_id)
        for channel in channels:
            if channel == "in_app":
                continue
            if not await self._channel_enabled(user_id, category, channel, priority):
                continue
            if channel == "email" and user is not None:
                if await senders.send_email(to_email=user.email, subject=title,
                                            body=body or title):
                    sent.append("email")
            elif channel == "push":
                if await senders.send_push(user_id=user_id, title=title, body=body):
                    sent.append("push")
        notification.channels_sent = sent
        await self.session.flush()
        return notification

    async def _channel_enabled(self, user_id, category: str, channel: str, priority: str) -> bool:
        pref = await self.prefs.get(user_id, category, channel)
        return pref.enabled if pref is not None else _default_enabled(channel, priority)

    async def _resolve_audience(self, specs: list, payload: dict, actor_id) -> set[uuid.UUID]:
        users: set[uuid.UUID] = set()
        for spec in specs or []:
            if spec == "assignee" and payload.get("assignee_id"):
                users.add(_uuid(payload["assignee_id"]))
            elif spec == "actor" and actor_id:
                users.add(_uuid(actor_id))
            elif spec == "subscribers":
                users |= await self._all_active_users()
            elif isinstance(spec, str) and spec.startswith("user:"):
                users.add(_uuid(spec.split(":", 1)[1]))
            elif isinstance(spec, str) and spec.startswith("role:"):
                users |= await self._users_with_role(spec.split(":", 1)[1])
        return {u for u in users if u is not None}

    async def _users_with_role(self, role_name: str) -> set[uuid.UUID]:
        stmt = (select(User.id)
                .join(UserRole, UserRole.user_id == User.id)
                .join(Role, Role.id == UserRole.role_id)
                .where(User.tenant_id == self.tenant_id, User.deleted_at.is_(None),
                       User.status == "active", Role.name == role_name,
                       Role.tenant_id == self.tenant_id))
        return set((await self.session.execute(stmt)).scalars().all())

    async def _all_active_users(self) -> set[uuid.UUID]:
        stmt = select(User.id).where(User.tenant_id == self.tenant_id, User.deleted_at.is_(None),
                                     User.status == "active")
        return set((await self.session.execute(stmt)).scalars().all())

    async def _user(self, user_id) -> User | None:
        return (await self.session.execute(select(User).where(
            User.id == _uuid(user_id)))).scalar_one_or_none()


# ── HTTP-facing service (inbox / mark-read / preferences / broadcast) ─────────
_ALL_CATEGORIES = [
    "wo_assigned", "gap_detected", "prediction", "doc_processed", "mention",
    "digest", "safety_alert", "system",
]


class NotificationService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = NotificationRepository(session, tenant_id)
        self.prefs = PreferenceRepository(session, tenant_id)

    async def list(self, user_id: uuid.UUID, params: PageParams, **filters) -> PageResult:
        return await self.repo.list(user_id, params, **filters)

    async def unread_count(self, user_id: uuid.UUID) -> int:
        return await self.repo.unread_count(user_id)

    async def mark_read(self, user_id: uuid.UUID, *, ids, all_: bool) -> int:
        return await self.repo.mark_read(user_id, ids=ids, all_=all_)

    async def preferences(self, user_id: uuid.UUID) -> list[dict]:
        """Effective matrix: stored overrides overlaid on defaults, per category×channel."""
        stored = {(p.category, p.channel): p.enabled for p in await self.prefs.for_user(user_id)}
        matrix: list[dict] = []
        for category in _ALL_CATEGORIES:
            row = {"category": category, "channels": {}}
            for channel in ("in_app", "email", "push"):
                row["channels"][channel] = stored.get(
                    (category, channel), _default_enabled(channel, "high"))
            matrix.append(row)
        return matrix

    async def set_preferences(self, user_id: uuid.UUID, *, updates: list) -> list[dict]:
        for upd in updates:
            await self.prefs.upsert(user_id, upd.category, upd.channel, upd.enabled)
        await self.session.flush()
        return await self.preferences(user_id)

    async def broadcast(self, *, category: str, priority: str, title: str, body: str | None,
                        audience: list | None, actor) -> int:
        router = NotificationRouter(self.session, self.tenant_id)
        user_ids = await router._resolve_audience(audience or ["subscribers"], {}, str(actor.id))
        for user_id in user_ids:
            await router.deliver(user_id=user_id, category=category, priority=priority, title=title,
                                 body=body, entity_type="broadcast", entity_id=None,
                                 channels=["in_app", "email"])
        return len(user_ids)


def _render(template: str | None, payload: dict) -> str | None:
    """Safe title interpolation — missing placeholders collapse to empty, no KeyError."""
    if not template:
        return None
    import re

    return re.sub(r"\{(\w+)\}", lambda m: str(payload.get(m.group(1), "")), template).strip()


def _uuid(value) -> uuid.UUID | None:
    if value is None or isinstance(value, uuid.UUID):
        return value
    return uuid.UUID(str(value))
