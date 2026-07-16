"""Retention runner + policy CRUD (docs/08 S14).

The runner is table-agnostic: a small registry maps each governed entity to its
table and the timestamp column that decides age. `archive` streams the doomed
rows to a gzip JSONL object before deleting; `delete` skips the archive. Both
delete in batches of 1000 so a large sweep doesn't hold one giant transaction,
and both write an audit-log entry.
"""

from __future__ import annotations

import gzip
import io
import json
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFound, ValidationFailed
from app.core.logging import get_logger
from app.modules.audit.service import AuditService
from app.modules.retention.models import RETENTION_ENTITIES, RetentionPolicy

log = get_logger("retention")

DELETE_BATCH = 1000

# entity → (table name, age column, has tenant_id column). audit_log/ai_usage are
# tenant-scoped by a nullable tenant_id; all governed tables carry created_at.
_REGISTRY: dict[str, tuple[str, str, bool]] = {
    "audit_log": ("audit_log", "created_at", True),
    "notifications": ("notifications", "created_at", True),
    "chat_sessions": ("chat_sessions", "created_at", True),
    "ingestion_jobs": ("ingestion_jobs", "created_at", True),
    "webhook_deliveries": ("webhook_deliveries", "created_at", True),
    "ai_usage": ("ai_usage", "created_at", True),
    "report_runs": ("report_runs", "created_at", True),
}


class RetentionService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.audit = AuditService(session)

    async def list(self) -> list[RetentionPolicy]:
        return list((await self.session.execute(
            select(RetentionPolicy).where(RetentionPolicy.tenant_id == self.tenant_id)
            .order_by(RetentionPolicy.entity))).scalars().all())

    async def get(self, policy_id: uuid.UUID) -> RetentionPolicy:
        row = (await self.session.execute(
            select(RetentionPolicy).where(RetentionPolicy.id == policy_id,
                                          RetentionPolicy.tenant_id == self.tenant_id)
        )).scalar_one_or_none()
        if row is None:
            raise NotFound("Retention policy not found", code="RETENTION_POLICY_NOT_FOUND")
        return row

    @staticmethod
    def _validate(entity: str, action: str) -> None:
        if entity not in RETENTION_ENTITIES:
            raise ValidationFailed(f"Unknown retention entity: {entity}",
                                   code="RETENTION_ENTITY_UNKNOWN", http_status=422)
        if action not in ("archive", "delete"):
            raise ValidationFailed("action must be archive or delete",
                                   code="RETENTION_ACTION_INVALID", http_status=422)

    async def upsert(self, *, entity: str, keep_days: int, action: str, is_active: bool,
                     actor_id: uuid.UUID) -> RetentionPolicy:
        self._validate(entity, action)
        row = (await self.session.execute(
            select(RetentionPolicy).where(RetentionPolicy.tenant_id == self.tenant_id,
                                          RetentionPolicy.entity == entity))).scalar_one_or_none()
        if row is None:
            row = RetentionPolicy(tenant_id=self.tenant_id, entity=entity, created_by=actor_id)
            self.session.add(row)
        row.keep_days = keep_days
        row.action = action
        row.is_active = is_active
        row.updated_by = actor_id
        await self.session.flush()
        return row

    async def delete(self, policy_id: uuid.UUID) -> None:
        row = await self.get(policy_id)
        await self.session.delete(row)
        await self.session.flush()

    # ── the runner ───────────────────────────────────────────────────────────
    async def run(self, policy: RetentionPolicy, *, now: datetime | None = None) -> int:
        """Apply one policy; returns rows affected. Best-effort archive, batched
        delete, audit entry, and last_run bookkeeping."""
        now = now or datetime.now(UTC)
        table, age_col, has_tenant = _REGISTRY[policy.entity]
        cutoff = now - timedelta(days=policy.keep_days)

        where = f'"{age_col}" < :cutoff'
        params: dict = {"cutoff": cutoff}
        if has_tenant:
            # tenant_id is nullable on some tables (system rows); a tenant policy
            # only ever reaps its own rows, never the shared/system ones.
            where += " AND tenant_id = :tenant_id"
            params["tenant_id"] = str(self.tenant_id)

        total = (await self.session.execute(
            text(f'SELECT count(*) FROM "{table}" WHERE {where}'), params)).scalar() or 0
        if total == 0:
            await self._finish(policy, now, 0)
            return 0

        if policy.action == "archive":
            await self._archive(table, where, params, policy.entity, now)

        # Batched delete by id so a huge sweep doesn't lock the table in one shot.
        deleted = 0
        while True:
            ids = (await self.session.execute(
                text(f'SELECT id FROM "{table}" WHERE {where} LIMIT {DELETE_BATCH}'),
                params)).scalars().all()
            if not ids:
                break
            await self.session.execute(
                text(f'DELETE FROM "{table}" WHERE id = ANY(:ids)'), {"ids": list(ids)})
            deleted += len(ids)
            await self.session.commit()  # release locks between batches

        await self._finish(policy, now, deleted)
        await self.audit.write(action="retention.run", entity_type="retention_policy",
                               entity_id=policy.id, tenant_id=self.tenant_id,
                               after={"entity": policy.entity, "action": policy.action,
                                      "affected": deleted, "cutoff": cutoff.isoformat()})
        await self.session.commit()
        log.info("retention_run", entity=policy.entity, action=policy.action, affected=deleted)
        return deleted

    async def _archive(self, table: str, where: str, params: dict, entity: str,
                       now: datetime) -> None:
        """Stream the doomed rows to gzip JSONL in object storage before deletion."""
        from app.core import storage

        rows = (await self.session.execute(
            text(f'SELECT to_jsonb(t) FROM "{table}" t WHERE {where}'), params)).scalars().all()
        buf = io.BytesIO()
        with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
            for row in rows:
                gz.write((json.dumps(row, default=str) + "\n").encode())
        key = f"retention/{entity}/{now.date().isoformat()}/{self.tenant_id}.jsonl.gz"
        try:
            await _to_thread(storage.put_object, key, buf.getvalue(), "application/gzip")
        except Exception as exc:  # noqa: BLE001
            # If the archive can't be written, do NOT proceed to delete — losing
            # rows we failed to preserve would violate the whole point of archive.
            raise ValidationFailed(f"Retention archive failed for {entity}: {exc}",
                                   code="RETENTION_ARCHIVE_FAILED", http_status=500) from exc

    async def _finish(self, policy: RetentionPolicy, now: datetime, affected: int) -> None:
        policy.last_run_at = now
        policy.last_affected = affected
        await self.session.flush()


async def _to_thread(fn, *args):
    import asyncio

    return await asyncio.to_thread(fn, *args)


def _default_keep_days_key(entity: str) -> str:
    """Settings key holding this entity's default keep_days (docs/08 S14)."""
    return f"retention.{entity}_days"
