"""Notification service: routing, delivery, inbox, preferences (docs/02 §20, §34).

`NotificationRouter.route(event)` is the event-bus entrypoint: it loads the DB
routing rules for the event type, resolves each rule's audience (assignee / actor
/ role / subscribers), and delivers one notification per user across the rule's
channels — gated by that user's preferences. Delivery persists an in-app row +
WS `notification.new`, sends email (mailhog) and a push stub. `NotificationService`
serves the inbox / mark-read / preferences / broadcast HTTP surface.
"""

from __future__ import annotations

import builtins  # `list` is shadowed by a `list()` method below
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams, PageResult
from app.core.logging import get_logger
from app.modules.auth.models import User
from app.modules.notifications import senders, templating
from app.modules.notifications.models import Notification
from app.modules.notifications.repository import (
    EventPreferenceRepository,
    NotificationRepository,
    PreferenceRepository,
    RuleRepository,
    TemplateRepository,
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
        self.event_prefs = EventPreferenceRepository(session, tenant_id)
        self.templates = TemplateRepository(session, tenant_id)
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
                                   entity_id=entity_id, channels=channels,
                                   event_code=event_type, payload=payload)
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
                      entity_id, channels, event_code: str | None = None,
                      payload: dict | None = None) -> Notification | None:
        user = await self._user(user_id)
        # Event-code preference matrix (docs/05 S3) gates in_app/email + digest mode.
        ev = await self._event_pref(user_id, event_code, priority) if event_code else None
        locale = (user.locale if user is not None else None) or "en"

        # Templates (tenant override → system) render the in-app + email copy.
        in_app_title, in_app_body = await self._render_channel(
            event_code, "in_app", locale, payload, title, body)

        sent: list[str] = []
        notification: Notification | None = None
        if ev is None or ev.in_app:
            notification = await self.repo.add(Notification(
                user_id=_uuid(user_id), category=category, event_code=event_code, priority=priority,
                title=(in_app_title or title)[:512], body=in_app_body or body,
                entity_type=entity_type, entity_id=_uuid(entity_id) if entity_id else None,
                channels_sent=[]))
            if await senders.send_in_app(notification):
                sent.append("in_app")

        for channel in channels:
            if channel == "in_app":
                continue
            if channel == "email" and user is not None:
                if not self._email_now(ev, category, priority):
                    continue
                subject, mail_body = await self._render_channel(
                    event_code, "email", locale, payload, in_app_title or title,
                    in_app_body or body)
                template = await self._template(event_code, "email", locale)
                if await senders.send_email_logged(
                    self.session, self.tenant_id, to_email=user.email,
                    subject=subject or in_app_title or title, body=mail_body or body or title,
                    template_id=template.id if template else None):
                    sent.append("email")
            elif channel == "push":
                if await senders.send_push(user_id=user_id, title=title, body=body):
                    sent.append("push")
        if notification is not None:
            notification.channels_sent = sent
            await self.session.flush()
        return notification

    async def _event_pref(self, user_id, event_code: str, priority: str):
        return await self.event_prefs.get(user_id, event_code)

    def _email_now(self, ev, category: str, priority: str) -> bool:
        """Whether to send an instant email. digest=daily defers to the digest job."""
        if ev is not None:
            return bool(ev.email) and ev.digest == "instant"
        return _default_enabled("email", priority)

    async def _template(self, event_code: str | None, channel: str, locale: str):
        if not event_code:
            return None
        return await self.templates.resolve(event_code, channel, locale)

    async def _render_channel(self, event_code, channel, locale, payload, fallback_title,
                              fallback_body) -> tuple[str | None, str | None]:
        template = await self._template(event_code, channel, locale)
        if template is None:
            return fallback_title, fallback_body
        ctx = payload or {}
        subject = templating.render(template.subject_tpl, ctx) or fallback_title
        rendered_body = templating.render(template.body_tpl, ctx) or fallback_body
        return subject, rendered_body

    async def _channel_enabled(self, user_id, category: str, channel: str, priority: str) -> bool:
        pref = await self.prefs.get(user_id, category, channel)
        return pref.enabled if pref is not None else _default_enabled(channel, priority)

    async def _resolve_audience(self, specs: list, payload: dict, actor_id) -> set[uuid.UUID]:
        users: set[uuid.UUID] = set()

        def _add(value) -> None:
            # _uuid() returns None for anything unparseable — skip rather than
            # poison the audience with a None id.
            parsed = _uuid(value)
            if parsed is not None:
                users.add(parsed)

        for spec in specs or []:
            if spec == "assignee" and payload.get("assignee_id"):
                _add(payload["assignee_id"])
            elif spec == "actor" and actor_id:
                _add(actor_id)
            elif spec == "subscribers":
                users |= await self._all_active_users()
            elif isinstance(spec, str) and spec.startswith("user:"):
                _add(spec.split(":", 1)[1])
            elif isinstance(spec, str) and spec.startswith("role:"):
                users |= await self._users_with_role(spec.split(":", 1)[1])
        return users

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

    async def preferences(self, user_id: uuid.UUID) -> builtins.list[dict]:
        """Effective matrix: stored overrides overlaid on defaults, per category×channel."""
        stored = {(p.category, p.channel): p.enabled for p in await self.prefs.for_user(user_id)}
        matrix: list[dict] = []
        for category in _ALL_CATEGORIES:
            row: dict[str, Any] = {"category": category, "channels": {}}
            for channel in ("in_app", "email", "push"):
                row["channels"][channel] = stored.get(
                    (category, channel), _default_enabled(channel, "high"))
            matrix.append(row)
        return matrix

    async def set_preferences(self, user_id: uuid.UUID, *,
                              updates: builtins.list) -> builtins.list[dict]:
        for upd in updates:
            await self.prefs.upsert(user_id, upd.category, upd.channel, upd.enabled)
        await self.session.flush()
        return await self.preferences(user_id)

    async def broadcast(self, *, category: str, priority: str, title: str, body: str | None,
                        audience: builtins.list | None, actor) -> int:
        router = NotificationRouter(self.session, self.tenant_id)
        user_ids = await router._resolve_audience(audience or ["subscribers"], {}, str(actor.id))
        payload = {"title": title, "body": body, "category": category, "priority": priority}
        for user_id in user_ids:
            await router.deliver(user_id=user_id, category=category, priority=priority, title=title,
                                 body=body, entity_type="broadcast", entity_id=None,
                                 channels=["in_app", "email"], event_code="notification.broadcast",
                                 payload=payload)
        return len(user_ids)


# ── event-code preference matrix (docs/05 S3) ─────────────────────────────────
class EventPreferenceService:
    """The `/me/notification-preferences` matrix: event × (in_app | email | digest)."""

    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = EventPreferenceRepository(session, tenant_id)

    async def matrix(self, user_id: uuid.UUID) -> list[dict]:
        from app.modules.notifications.models import EVENT_CODES

        stored = {p.event_code: p for p in await self.repo.for_user(user_id)}
        matrix: list[dict] = []
        for code in EVENT_CODES:
            pref = stored.get(code)
            matrix.append({
                "event_code": code,
                "in_app": pref.in_app if pref else True,
                "email": pref.email if pref else False,
                "digest": pref.digest if pref else "instant",
            })
        return matrix

    async def set(self, user_id: uuid.UUID, *, updates: list) -> list[dict]:
        for upd in updates:
            await self.repo.upsert(user_id, upd.event_code, in_app=upd.in_app,
                                   email=upd.email, digest=upd.digest)
        await self.session.flush()
        return await self.matrix(user_id)


# ── template admin (docs/05 S3) ───────────────────────────────────────────────
class TemplateService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = TemplateRepository(session, tenant_id)
        from app.modules.audit.service import AuditService

        self.audit = AuditService(session)

    async def list(self, *, event_code: str | None = None):
        return await self.repo.list(event_code=event_code)

    async def get(self, template_id: uuid.UUID):
        from app.core.exceptions import NotFound
        from app.modules.notifications.models import NotificationTemplate

        row: NotificationTemplate | None = await self.repo.get(template_id)
        if row is None:
            raise NotFound("Template not found", code="TEMPLATE_NOT_FOUND")
        return row

    async def create(self, *, data, actor):
        from app.modules.notifications.models import NotificationTemplate

        row = await self.repo.add(NotificationTemplate(
            tenant_id=self.tenant_id, event_code=data.event_code, channel=data.channel,
            locale=data.locale, subject_tpl=data.subject_tpl, body_tpl=data.body_tpl,
            sample_payload=data.sample_payload, is_active=data.is_active,
            created_by=actor.id, updated_by=actor.id))
        await self.audit.write(action="notif_template.create", entity_type="notification_template",
                               entity_id=row.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"event_code": data.event_code, "channel": data.channel})
        return row

    async def update(self, template_id: uuid.UUID, *, data, actor):
        from app.core.exceptions import PermissionDenied

        row = await self.get(template_id)
        # System templates are read-only; a tenant edits by creating its own override.
        if row.tenant_id is None:
            raise PermissionDenied("System templates are read-only; create a tenant override")
        for field in ("subject_tpl", "body_tpl", "locale", "sample_payload", "is_active"):
            val = getattr(data, field)
            if val is not None:
                setattr(row, field, val)
        row.version += 1
        row.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="notif_template.update", entity_type="notification_template",
                               entity_id=row.id, tenant_id=self.tenant_id, actor_id=actor.id)
        return row

    async def delete(self, template_id: uuid.UUID, *, actor) -> None:
        from sqlalchemy import func

        from app.core.exceptions import PermissionDenied

        row = await self.get(template_id)
        if row.tenant_id is None:
            raise PermissionDenied("System templates cannot be deleted")
        row.deleted_at = func.now()
        row.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="notif_template.delete", entity_type="notification_template",
                               entity_id=row.id, tenant_id=self.tenant_id, actor_id=actor.id)

    async def preview(self, *, template_id: uuid.UUID | None, subject_tpl: str | None,
                      body_tpl: str | None, sample_payload: dict | None) -> dict:
        """Render subject/body against a sample payload (stored template or inline)."""
        if template_id is not None:
            row = await self.get(template_id)
            subject_tpl = subject_tpl if subject_tpl is not None else row.subject_tpl
            body_tpl = body_tpl if body_tpl is not None else row.body_tpl
            payload = sample_payload if sample_payload is not None else (row.sample_payload or {})
        else:
            payload = sample_payload or {}
        return {
            "subject": templating.render(subject_tpl, payload),
            "body": templating.render(body_tpl, payload),
        }


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
