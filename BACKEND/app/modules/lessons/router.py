"""Lessons HTTP router (docs/02 §14, §15).

Reads need `lesson.read`; detect/publish/edit/delete need `lesson.publish`.
`POST /ai/lessons/detect` runs the clustering agent (admin/scheduled). `events`
import registers the graph + trigger subscribers.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams
from app.common.responses import success
from app.core.database import get_session
from app.modules.auth.dependencies import CurrentUser, require
from app.modules.lessons import events as _events  # noqa: F401 — registers subscribers
from app.modules.lessons.agent import LessonsAgent
from app.modules.lessons.schemas import LessonDetect, LessonRead, LessonUpdate
from app.modules.lessons.service import LessonService

router = APIRouter(tags=["lessons"])


def _page(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
          sort: str | None = Query("-created_at")) -> PageParams:
    return PageParams(page=page, page_size=page_size, sort=sort)


@router.post("/ai/lessons/detect", summary="Run the lessons-learned clustering agent")
async def detect_lessons(body: LessonDetect | None = None,
                         actor: CurrentUser = Depends(require("lesson.publish")),
                         session: AsyncSession = Depends(get_session)) -> dict:
    created = await LessonsAgent(session, actor.tenant_id).detect(
        scope=body.scope if body else {}, actor=actor)
    return success({"created": len(created),
                    "lessons": [LessonRead.model_validate(x).model_dump() for x in created]})


@router.get("/lessons", summary="List lessons learned")
async def list_lessons(params: PageParams = Depends(_page),
                       status: str | None = Query(None),
                       source: str | None = Query(None),
                       actor: CurrentUser = Depends(require("lesson.read")),
                       session: AsyncSession = Depends(get_session)) -> dict:
    page = await LessonService(session, actor.tenant_id).list(params, status=status, source=source)
    return success([LessonRead.model_validate(x).model_dump() for x in page.items], meta=page.meta)


@router.get("/lessons/{lesson_id}", summary="Get a lesson")
async def get_lesson(lesson_id: uuid.UUID,
                     actor: CurrentUser = Depends(require("lesson.read")),
                     session: AsyncSession = Depends(get_session)) -> dict:
    lesson = await LessonService(session, actor.tenant_id).get(lesson_id)
    return success(LessonRead.model_validate(lesson).model_dump())


@router.patch("/lessons/{lesson_id}", summary="Edit a lesson (human-in-the-loop)")
async def update_lesson(lesson_id: uuid.UUID, body: LessonUpdate,
                        actor: CurrentUser = Depends(require("lesson.publish")),
                        session: AsyncSession = Depends(get_session)) -> dict:
    lesson = await LessonService(session, actor.tenant_id).update(lesson_id, data=body, actor=actor)
    return success(LessonRead.model_validate(lesson).model_dump())


@router.post("/lessons/{lesson_id}/publish", summary="Publish a lesson → broadcast + graph edges")
async def publish_lesson(lesson_id: uuid.UUID,
                         actor: CurrentUser = Depends(require("lesson.publish")),
                         session: AsyncSession = Depends(get_session)) -> dict:
    lesson = await LessonService(session, actor.tenant_id).publish(lesson_id, actor=actor)
    return success(LessonRead.model_validate(lesson).model_dump())


@router.delete("/lessons/{lesson_id}", summary="Delete a lesson")
async def delete_lesson(lesson_id: uuid.UUID,
                        actor: CurrentUser = Depends(require("lesson.publish")),
                        session: AsyncSession = Depends(get_session)) -> dict:
    await LessonService(session, actor.tenant_id).delete(lesson_id, actor=actor)
    return success({"message": "Lesson deleted"})
