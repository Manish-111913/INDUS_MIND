"""Extraction-rule admin service (docs/05 S7).

Owns the write side of `extraction_rules`. Every mutation bumps `version` and
busts the tenant's Redis rule cache, so the ingestion worker picks the change up
on its next document without a restart.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFound, ValidationFailed
from app.modules.ingestion.models import ExtractionRule
from app.modules.ingestion.rules_engine import InvalidPattern, bust_cache, compile_pattern
from app.modules.ingestion.rules_schemas import RuleCreate, RuleUpdate


class ExtractionRuleService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    async def list(self, *, entity_type: str | None = None,
                   is_active: bool | None = None) -> list[ExtractionRule]:
        stmt = select(ExtractionRule).where(ExtractionRule.tenant_id == self.tenant_id)
        if entity_type:
            stmt = stmt.where(ExtractionRule.entity_type == entity_type)
        if is_active is not None:
            stmt = stmt.where(ExtractionRule.is_active.is_(is_active))
        # Same order the engine applies them in, so the admin table reads as the
        # execution order.
        stmt = stmt.order_by(ExtractionRule.priority.asc(), ExtractionRule.created_at.asc())
        return list((await self.session.execute(stmt)).scalars().all())

    async def get(self, rule_id: uuid.UUID) -> ExtractionRule:
        stmt = select(ExtractionRule).where(ExtractionRule.id == rule_id,
                                            ExtractionRule.tenant_id == self.tenant_id)
        row = (await self.session.execute(stmt)).scalar_one_or_none()
        if row is None:
            raise NotFound("Extraction rule not found", code="EXTRACTION_RULE_NOT_FOUND")
        return row

    @staticmethod
    def _validate_pattern(method: str, pattern: str | None) -> None:
        """Reject an uncompilable regex at write time — an active rule that throws
        would otherwise be skipped silently on every document it touches."""
        if method == "regex" and pattern:
            try:
                compile_pattern(pattern)
            except InvalidPattern as exc:
                raise ValidationFailed(str(exc), code="EXTRACTION_RULE_INVALID_PATTERN",
                                       http_status=422) from exc

    async def create(self, body: RuleCreate, actor_id: uuid.UUID) -> ExtractionRule:
        self._validate_pattern(body.method, body.pattern)
        row = ExtractionRule(tenant_id=self.tenant_id, created_by=actor_id, updated_by=actor_id,
                             **body.model_dump())
        self.session.add(row)
        await self.session.flush()
        await bust_cache(self.tenant_id)
        return row

    async def update(self, rule_id: uuid.UUID, body: RuleUpdate, actor_id: uuid.UUID) -> ExtractionRule:
        row = await self.get(rule_id)
        patch = body.model_dump(exclude_unset=True)

        merged_method = patch.get("method", row.method)
        merged_pattern = patch.get("pattern", row.pattern)
        merged_hint = patch.get("llm_hint", row.llm_hint)
        # The create-time pairing check has to be re-run against the merged row:
        # a PATCH switching method to 'regex' without supplying a pattern would
        # otherwise produce an active rule that can never match.
        if merged_method in ("regex", "keyword") and not (merged_pattern or "").strip():
            raise ValidationFailed(f"method '{merged_method}' requires a pattern",
                                   code="EXTRACTION_RULE_INVALID", http_status=422)
        if merged_method == "llm" and not (merged_hint or "").strip():
            raise ValidationFailed("method 'llm' requires an llm_hint",
                                   code="EXTRACTION_RULE_INVALID", http_status=422)
        self._validate_pattern(merged_method, merged_pattern)

        for field, value in patch.items():
            setattr(row, field, value)
        row.updated_by = actor_id
        # The rule version is what entities are stamped with, so it must advance on
        # every edit — that is how a re-ingest is distinguishable from the old one.
        row.version = int(row.version) + 1
        await self.session.flush()
        await bust_cache(self.tenant_id)
        return row

    async def delete(self, rule_id: uuid.UUID) -> None:
        row = await self.get(rule_id)
        await self.session.delete(row)
        await self.session.flush()
        await bust_cache(self.tenant_id)
