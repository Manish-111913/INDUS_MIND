"""Chat HTTP router (docs/02 §16). SSE streaming for copilot answers."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.responses import success
from app.core.database import get_session
from app.modules.ai.chat_service import ChatService
from app.modules.ai.schemas import (
    ChatMessageRead,
    ChatSessionCreate,
    ChatSessionRead,
    ChatSessionUpdate,
    FeedbackRequest,
    MessageCreate,
)
from app.modules.auth.dependencies import CurrentUser, require

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/sessions", status_code=201, summary="Create a chat session")
async def create_session(body: ChatSessionCreate,
                         actor: CurrentUser = Depends(require("copilot.use")),
                         session: AsyncSession = Depends(get_session)) -> dict:
    row = await ChatService(session, actor.tenant_id).create_session(
        user_id=actor.id, title=body.title, scope=body.scope)
    return success(ChatSessionRead.model_validate(row).model_dump())


@router.get("/sessions", summary="List my chat sessions")
async def list_sessions(actor: CurrentUser = Depends(require("copilot.use")),
                        session: AsyncSession = Depends(get_session)) -> dict:
    rows = await ChatService(session, actor.tenant_id).list_sessions(actor.id)
    return success([ChatSessionRead.model_validate(r).model_dump() for r in rows])


@router.patch("/sessions/{session_id}", summary="Rename / pin a session")
async def update_session(session_id: uuid.UUID, body: ChatSessionUpdate,
                         actor: CurrentUser = Depends(require("copilot.use")),
                         session: AsyncSession = Depends(get_session)) -> dict:
    row = await ChatService(session, actor.tenant_id).update_session(
        session_id, actor.id, title=body.title, pinned=body.pinned)
    return success(ChatSessionRead.model_validate(row).model_dump())


@router.delete("/sessions/{session_id}", summary="Delete a chat session")
async def delete_session(session_id: uuid.UUID,
                         actor: CurrentUser = Depends(require("copilot.use")),
                         session: AsyncSession = Depends(get_session)) -> dict:
    await ChatService(session, actor.tenant_id).delete_session(session_id, actor.id)
    return success({"message": "Session deleted"})


@router.get("/sessions/{session_id}/messages", summary="List messages in a session")
async def list_messages(session_id: uuid.UUID,
                        actor: CurrentUser = Depends(require("copilot.use")),
                        session: AsyncSession = Depends(get_session)) -> dict:
    rows = await ChatService(session, actor.tenant_id).list_messages(session_id, actor.id)
    return success([ChatMessageRead.model_validate(r).model_dump() for r in rows])


@router.post("/sessions/{session_id}/messages", summary="Send a message → SSE stream")
async def send_message(session_id: uuid.UUID, body: MessageCreate,
                       actor: CurrentUser = Depends(require("copilot.use")),
                       session: AsyncSession = Depends(get_session)) -> StreamingResponse:
    generator = ChatService(session, actor.tenant_id).stream_message(
        session_id, actor.id, body.content)
    return StreamingResponse(generator, media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/messages/{message_id}/feedback", summary="Rate an answer 👍/👎")
async def feedback(message_id: uuid.UUID, body: FeedbackRequest,
                   actor: CurrentUser = Depends(require("copilot.use")),
                   session: AsyncSession = Depends(get_session)) -> dict:
    await ChatService(session, actor.tenant_id).feedback(
        message_id, value=body.value, reason=body.reason, reason_code=body.reason_code,
        comment=body.comment, actor=actor)
    return success({"message": "Feedback recorded"})


@router.post("/messages/{message_id}/save-to-kb", summary="Save an answer to the knowledge base")
async def save_to_kb(message_id: uuid.UUID,
                     actor: CurrentUser = Depends(require("copilot.use")),
                     session: AsyncSession = Depends(get_session)) -> dict:
    insight = await ChatService(session, actor.tenant_id).save_to_kb(message_id, actor=actor)
    return success({"saved_insight_id": str(insight.id)})
