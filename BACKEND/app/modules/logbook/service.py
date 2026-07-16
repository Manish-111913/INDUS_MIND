"""Shift-logbook service (docs/08 S13).

Draft CRUD, plus the two things that make a logbook more than a text box:
`submit` registers the log as a document and runs it through the ingestion
pipeline's back half so the Copilot can cite it, and `summarize` produces a
handover summary via the LLM (prompt `shift_handover`, metered as feature=logbook).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFound, ValidationFailed
from app.core.logging import get_logger
from app.modules.audit.service import AuditService
from app.modules.logbook.models import ShiftLog

log = get_logger("logbook")

SUMMARY_PROMPT_KEY = "shift_handover"


class ShiftLogService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.audit = AuditService(session)

    async def list(self, *, plant_id=None, shift=None, date_from=None, date_to=None,
                   status=None) -> list[ShiftLog]:
        stmt = select(ShiftLog).where(ShiftLog.tenant_id == self.tenant_id)
        if plant_id:
            stmt = stmt.where(ShiftLog.plant_id == plant_id)
        if shift:
            stmt = stmt.where(ShiftLog.shift == shift)
        if date_from:
            stmt = stmt.where(ShiftLog.log_date >= date_from)
        if date_to:
            stmt = stmt.where(ShiftLog.log_date <= date_to)
        if status:
            stmt = stmt.where(ShiftLog.status == status)
        stmt = stmt.order_by(ShiftLog.log_date.desc(), ShiftLog.created_at.desc())
        rows = list((await self.session.execute(stmt)).scalars().all())
        return await self._attach_names(rows)

    async def _attach_names(self, rows: list[ShiftLog]) -> list[ShiftLog]:
        """Resolve author + plant display names in two batched queries and pin
        them onto each row (read by ShiftLogRead) — avoids N+1 and a UI round-trip."""
        from app.modules.auth.models import User
        from app.modules.equipment.models import Plant

        if not rows:
            return rows
        author_ids = {r.author_id for r in rows if r.author_id}
        plant_ids = {r.plant_id for r in rows if r.plant_id}
        authors: dict = {}
        if author_ids:
            res = await self.session.execute(
                select(User.id, User.full_name).where(User.id.in_(author_ids)))
            authors = dict(res.all())
        plants: dict = {}
        if plant_ids:
            res = await self.session.execute(
                select(Plant.id, Plant.name).where(Plant.id.in_(plant_ids)))
            plants = dict(res.all())
        for r in rows:
            r.author_name = authors.get(r.author_id)
            r.plant_name = plants.get(r.plant_id)
        return rows

    async def get(self, log_id: uuid.UUID) -> ShiftLog:
        row = (await self.session.execute(
            select(ShiftLog).where(ShiftLog.id == log_id, ShiftLog.tenant_id == self.tenant_id)
        )).scalar_one_or_none()
        if row is None:
            raise NotFound("Shift log not found", code="SHIFT_LOG_NOT_FOUND")
        await self._attach_names([row])
        return row

    async def create(self, data, actor_id: uuid.UUID) -> ShiftLog:
        row = ShiftLog(tenant_id=self.tenant_id, plant_id=data.plant_id, shift=data.shift,
                       log_date=data.log_date, author_id=actor_id, content=data.content,
                       tags=data.tags, status="draft", created_by=actor_id, updated_by=actor_id)
        self.session.add(row)
        await self.session.flush()
        return row

    async def update(self, log_id: uuid.UUID, data, actor_id: uuid.UUID) -> ShiftLog:
        row = await self.get(log_id)
        if row.status == "submitted":
            # Submitted logs are immutable — the handover record must not change
            # under the next shift's feet.
            raise ConflictError("A submitted shift log cannot be edited",
                                code="SHIFT_LOG_IMMUTABLE")
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(row, field, value)
        row.updated_by = actor_id
        await self.session.flush()
        return row

    async def submit(self, log_id: uuid.UUID, actor_id: uuid.UUID) -> ShiftLog:
        """Mark submitted and ingest the log as a citable document (docs/08 S13)."""
        from app.core.events import Event, EventType, bus

        row = await self.get(log_id)
        if row.status == "submitted":
            raise ConflictError("Shift log already submitted", code="SHIFT_LOG_ALREADY_SUBMITTED")
        row.status = "submitted"
        row.submitted_at = datetime.now(UTC)
        row.updated_by = actor_id
        await self.session.flush()

        try:
            document_id = await self._ingest_as_document(row, actor_id)
            row.document_id = document_id
            await self.session.flush()
        except Exception as exc:  # noqa: BLE001 — a search-index hiccup must not lose the log
            log.warning("shift_log_ingest_failed", log_id=str(row.id), error=str(exc))

        await self.audit.write(action="shift_log.submit", entity_type="shift_log",
                               entity_id=row.id, tenant_id=self.tenant_id, actor_id=actor_id,
                               after={"document_id": str(row.document_id) if row.document_id
                                      else None})
        await bus.publish(Event(EventType.SHIFT_LOG_SUBMITTED, tenant_id=str(self.tenant_id),
                                actor_id=str(actor_id),
                                payload={"shift_log_id": str(row.id),
                                         "document_id": str(row.document_id) if row.document_id
                                         else None}))
        return row

    async def _ingest_as_document(self, row: ShiftLog, actor_id: uuid.UUID) -> uuid.UUID:
        """Register the log as a document + version, store the rendered text, and
        run chunk→embed→entities on it (docs/08 S13). Reuses the ingestion
        pipeline's text path so a log is retrieved exactly like an upload."""
        import hashlib

        from app.core import storage
        from app.modules.documents.models import Document, DocumentVersion
        from app.modules.ingestion.pipeline import ingest_text

        rendered = self._render_text(row)
        data = rendered.encode()
        checksum = hashlib.sha256(data).hexdigest()
        storage_key = f"{self.tenant_id}/shift_logs/{row.id}.txt"
        await _to_thread(storage.put_object, storage_key, data, "text/plain")

        title = f"Shift log · {row.shift} · {row.log_date.isoformat()}"
        doc = Document(tenant_id=self.tenant_id, plant_id=row.plant_id, title=title,
                       source="shift_log", storage_key=storage_key, mime="text/plain",
                       size_bytes=len(data), checksum=checksum, language="en",
                       uploaded_by=actor_id, ingestion_status="processing",
                       created_by=actor_id, updated_by=actor_id)
        self.session.add(doc)
        await self.session.flush()
        version = DocumentVersion(tenant_id=self.tenant_id, document_id=doc.id, version_no=1,
                                  storage_key=storage_key, mime="text/plain", size_bytes=len(data),
                                  checksum=checksum, confirmed_at=datetime.now(UTC),
                                  created_by=actor_id, updated_by=actor_id)
        self.session.add(version)
        await self.session.flush()
        doc.current_version_id = version.id
        await self.session.flush()

        await ingest_text(self.session, self.tenant_id, doc, rendered)
        doc.ingestion_status = "completed"
        await self.session.flush()
        return doc.id

    @staticmethod
    def _render_text(row: ShiftLog) -> str:
        tags = ", ".join(row.tags) if row.tags else ""
        header = f"Shift handover log — {row.shift} shift, {row.log_date.isoformat()}."
        if tags:
            header += f"\nTags: {tags}"
        return f"{header}\n\n{row.content}"

    async def summarize(self, log_id: uuid.UUID, actor_id: uuid.UUID) -> ShiftLog:
        """LLM handover summary, stored in ai_summary, metered feature=logbook."""
        from app.core import llm
        from app.modules.ai.service import PromptService

        row = await self.get(log_id)
        if row.status != "submitted":
            raise ValidationFailed("Only submitted logs can be summarised",
                                   code="SHIFT_LOG_NOT_SUBMITTED", http_status=422)
        try:
            prompt = await PromptService(self.session).render(
                self.tenant_id, SUMMARY_PROMPT_KEY, {"content": row.content})
        except Exception:  # noqa: BLE001 — a missing template shouldn't 500 the endpoint
            prompt = ("Summarise this shift log into a concise handover with the key events, "
                      f"open items, and any equipment to watch:\n\n{row.content}")
        resp = await llm.complete(
            self.session, self.tenant_id, "logbook",
            messages=[llm.LLMMessage(role="user", content=prompt)])
        row.ai_summary = resp.text.strip()
        row.updated_by = actor_id
        await self.session.flush()
        return row


async def _to_thread(fn, *args):
    import asyncio

    return await asyncio.to_thread(fn, *args)
