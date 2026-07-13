"""Chat sessions + streaming copilot messages (docs/02 §16).

The message handler runs the copilot graph (or replays the semantic cache),
persists the assistant message (citations, confidence, latency, prompt_version,
token usage, cached flag), and streams SSE events: token · citation · done.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFound
from app.core.logging import get_logger
from app.modules.ai import cache
from app.modules.ai.copilot import CopilotService
from app.modules.ai.models import AIInsight, ChatMessage, ChatSession
from app.modules.audit.service import AuditService
from app.modules.knowledge.retrieval import RetrievalScope

log = get_logger("ai.chat")


def scope_from_dict(scope: dict | None) -> RetrievalScope:
    scope = scope or {}

    def _uuids(key: str) -> list[uuid.UUID]:
        out = []
        for v in scope.get(key, []) or []:
            try:
                out.append(uuid.UUID(str(v)))
            except (ValueError, TypeError):
                pass
        return out

    dr = scope.get("date_range") or {}
    return RetrievalScope(
        plant_ids=_uuids("plant_ids"), equipment_ids=_uuids("equipment_ids"),
        doc_type_ids=_uuids("doc_types") or _uuids("doc_type_ids"),
        date_from=_parse_dt(dr.get("from")), date_to=_parse_dt(dr.get("to")))


def _parse_dt(value) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value))
    except ValueError:
        return None


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


class ChatService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.audit = AuditService(session)

    # ── sessions ─────────────────────────────────────────────────────────────
    async def create_session(self, *, user_id: uuid.UUID, title: str | None,
                             scope: dict | None) -> ChatSession:
        row = ChatSession(tenant_id=self.tenant_id, user_id=user_id, title=title,
                          scope=scope or {}, created_by=user_id, updated_by=user_id)
        self.session.add(row)
        await self.session.flush()
        return row

    async def list_sessions(self, user_id: uuid.UUID) -> list[ChatSession]:
        stmt = (select(ChatSession)
                .where(ChatSession.tenant_id == self.tenant_id, ChatSession.user_id == user_id,
                       ChatSession.deleted_at.is_(None))
                .order_by(ChatSession.pinned.desc(), ChatSession.updated_at.desc()))
        return list((await self.session.execute(stmt)).scalars())

    async def get_session(self, session_id: uuid.UUID, user_id: uuid.UUID) -> ChatSession:
        stmt = select(ChatSession).where(
            ChatSession.id == session_id, ChatSession.tenant_id == self.tenant_id,
            ChatSession.user_id == user_id, ChatSession.deleted_at.is_(None))
        row = (await self.session.execute(stmt)).scalar_one_or_none()
        if row is None:
            raise NotFound("Chat session not found", code="CHAT_SESSION_NOT_FOUND")
        return row

    async def update_session(self, session_id: uuid.UUID, user_id: uuid.UUID, *,
                             title: str | None, pinned: bool | None) -> ChatSession:
        row = await self.get_session(session_id, user_id)
        if title is not None:
            row.title = title
        if pinned is not None:
            row.pinned = pinned
        await self.session.flush()
        return row

    async def delete_session(self, session_id: uuid.UUID, user_id: uuid.UUID) -> None:
        row = await self.get_session(session_id, user_id)
        row.deleted_at = func.now()
        await self.session.flush()

    async def list_messages(self, session_id: uuid.UUID, user_id: uuid.UUID) -> list[ChatMessage]:
        await self.get_session(session_id, user_id)
        stmt = (select(ChatMessage)
                .where(ChatMessage.session_id == session_id, ChatMessage.tenant_id == self.tenant_id)
                .order_by(ChatMessage.created_at))
        return list((await self.session.execute(stmt)).scalars())

    # ── streaming message ────────────────────────────────────────────────────
    async def stream_message(self, session_id: uuid.UUID, user_id: uuid.UUID,
                             content: str) -> AsyncIterator[str]:
        sess = await self.get_session(session_id, user_id)
        self.session.add(ChatMessage(tenant_id=self.tenant_id, session_id=sess.id,
                                     role="user", content=content, created_by=user_id))
        await self.session.flush()

        cached_payload = await cache.lookup(self.tenant_id, content, sess.scope)
        if cached_payload is not None:
            answer = cached_payload["answer"]
            citations = cached_payload["citations"]
            confidence = cached_payload["confidence"]
            latency_ms = cached_payload.get("latency_ms", 0)
            prompt_version = cached_payload.get("prompt_version")
            token_usage = {}
            cached = True
        else:
            result = await CopilotService(self.session, self.tenant_id).run(
                content, scope=scope_from_dict(sess.scope))
            answer, citations = result.answer, result.citations
            confidence, latency_ms = result.confidence, result.latency_ms
            prompt_version, token_usage = result.prompt_version, result.token_usage
            cached = False
            await cache.store(self.tenant_id, content, sess.scope, {
                "answer": answer, "citations": citations, "confidence": confidence,
                "latency_ms": latency_ms, "prompt_version": prompt_version})

        message = ChatMessage(
            tenant_id=self.tenant_id, session_id=sess.id, role="assistant", content=answer,
            citations=citations, confidence=confidence["score"], confidence_level=confidence["level"],
            latency_ms=latency_ms, token_usage=token_usage, prompt_version=prompt_version,
            cached=cached, created_by=user_id)
        self.session.add(message)
        if not sess.title:
            sess.title = content[:60]
        await self.session.flush()

        # stream: tokens → citations → done
        for token in _tokenize(answer):
            yield _sse("token", {"text": token})
        for cit in citations:
            yield _sse("citation", cit)
        yield _sse("done", {"message_id": str(message.id), "confidence": confidence,
                            "latency_ms": latency_ms, "cached": cached})

    # ── feedback + save-to-kb ────────────────────────────────────────────────
    async def feedback(self, message_id: uuid.UUID, *, value: str, reason: str | None,
                       actor) -> ChatMessage:
        msg = await self._message(message_id)
        msg.feedback = value
        msg.feedback_reason = reason
        await self.session.flush()
        await self.audit.write(action="chat.feedback", entity_type="chat_message",
                               entity_id=msg.id, tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"value": value})
        return msg

    async def save_to_kb(self, message_id: uuid.UUID, *, actor) -> AIInsight:
        msg = await self._message(message_id)
        insight = AIInsight(
            tenant_id=self.tenant_id, role=None, category="saved_answer",
            title=(msg.content[:120] or "Saved answer"), body=msg.content,
            confidence=msg.confidence, evidence=msg.citations, actions=[],
            created_by=actor.id, updated_by=actor.id)
        self.session.add(insight)
        await self.session.flush()
        await self.audit.write(action="chat.save_to_kb", entity_type="chat_message",
                               entity_id=msg.id, tenant_id=self.tenant_id, actor_id=actor.id)
        return insight

    async def _message(self, message_id: uuid.UUID) -> ChatMessage:
        stmt = select(ChatMessage).where(ChatMessage.id == message_id,
                                         ChatMessage.tenant_id == self.tenant_id)
        row = (await self.session.execute(stmt)).scalar_one_or_none()
        if row is None:
            raise NotFound("Message not found", code="MESSAGE_NOT_FOUND")
        return row


def _tokenize(text: str) -> list[str]:
    # word-wise streaming (a real LLM streams native tokens; same event shape)
    return [w + " " for w in text.split(" ") if w] or [text]
