"""Lessons services (docs/02 §7, §10, §34).

CRUD + human-in-the-loop publish. Publishing a lesson: flips status to published,
projects `Lesson -[:DERIVED_FROM]->` graph edges, and emits `lesson.published`
which the notifications router broadcasts to subscribed teams.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams, PageResult
from app.core.events import Event, EventType, bus
from app.core.exceptions import ConflictError, NotFound, VersionMismatch
from app.modules.audit.service import AuditService
from app.modules.lessons.models import Lesson
from app.modules.lessons.repository import LessonRepository


def _check_version(entity, expected: int | None) -> None:
    if expected is not None and getattr(entity, "version", None) != expected:
        raise VersionMismatch()


class LessonService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = LessonRepository(session, tenant_id)
        self.audit = AuditService(session)

    async def list(self, params: PageParams, **filters) -> PageResult:
        return await self.repo.list(params, **filters)

    async def get(self, lesson_id: uuid.UUID) -> Lesson:
        lesson = await self.repo.get(lesson_id)
        if lesson is None:
            raise NotFound("Lesson not found", code="LESSON_NOT_FOUND")
        return lesson

    async def update(self, lesson_id: uuid.UUID, *, data, actor) -> Lesson:
        lesson = await self.get(lesson_id)
        _check_version(lesson, data.version)
        if lesson.status == "published" and data.status != "archived":
            raise ConflictError("Published lesson can only be archived", code="LESSON_PUBLISHED")
        for field in ("title", "narrative", "pattern_summary", "recommended_action", "status"):
            value = getattr(data, field)
            if value is not None:
                setattr(lesson, field, value)
        lesson.version += 1
        lesson.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="lesson.update", entity_type="lesson", entity_id=lesson.id,
                               tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"status": lesson.status})
        return lesson

    async def publish(self, lesson_id: uuid.UUID, *, actor) -> Lesson:
        lesson = await self.get(lesson_id)
        if lesson.status == "published":
            raise ConflictError("Lesson already published", code="LESSON_ALREADY_PUBLISHED")
        lesson.status = "published"
        lesson.published_at = datetime.now(UTC)
        lesson.published_by = actor.id
        lesson.version += 1
        lesson.updated_by = actor.id
        await self.session.flush()

        # Project the DERIVED_FROM graph edges (best-effort; graph is optional).
        from app.modules.lessons.events import project_lesson

        await project_lesson(self.tenant_id, lesson)

        await self.audit.write(action="lesson.publish", entity_type="lesson", entity_id=lesson.id,
                               tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"equipment": len(lesson.affected_equipment_ids)})
        # Broadcast to subscribed teams via the notifications router.
        await bus.publish(Event(EventType.LESSON_PUBLISHED, tenant_id=str(self.tenant_id),
                                actor_id=str(actor.id),
                                payload={"lesson_id": str(lesson.id), "lesson_title": lesson.title,
                                         "category": "mention", "priority": "normal",
                                         "entity_type": "lesson", "entity_id": str(lesson.id),
                                         "body": lesson.pattern_summary}))
        return lesson

    async def delete(self, lesson_id: uuid.UUID, *, actor) -> None:
        lesson = await self.get(lesson_id)
        lesson.deleted_at = func.now()
        lesson.updated_by = actor.id
        await self.session.flush()
        await self.audit.write(action="lesson.delete", entity_type="lesson", entity_id=lesson.id,
                               tenant_id=self.tenant_id, actor_id=actor.id)
