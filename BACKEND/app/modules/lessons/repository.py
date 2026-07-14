"""Lessons repository (docs/02 §7)."""

from __future__ import annotations

import uuid

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams, PageResult, paginate
from app.modules.lessons.models import Lesson


class LessonRepository:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    def _base(self) -> Select:
        return select(Lesson).where(Lesson.tenant_id == self.tenant_id, Lesson.deleted_at.is_(None))

    async def get(self, lesson_id: uuid.UUID | str) -> Lesson | None:
        return (await self.session.execute(
            self._base().where(Lesson.id == lesson_id))).scalar_one_or_none()

    async def by_pattern_key(self, pattern_key: str) -> Lesson | None:
        stmt = self._base().where(Lesson.pattern_key == pattern_key,
                                  Lesson.status != "archived").limit(1)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list(self, params: PageParams, *, status: str | None = None,
                   source: str | None = None) -> PageResult:
        stmt = self._base()
        if status:
            stmt = stmt.where(Lesson.status == status)
        if source:
            stmt = stmt.where(Lesson.source == source)
        stmt = stmt.order_by(Lesson.created_at.desc())
        return await paginate(self.session, stmt, params, Lesson)

    async def add(self, lesson: Lesson) -> Lesson:
        lesson.tenant_id = self.tenant_id  # type: ignore[assignment]
        self.session.add(lesson)
        await self.session.flush()
        return lesson
