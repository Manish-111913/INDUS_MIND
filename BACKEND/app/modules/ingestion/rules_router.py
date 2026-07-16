"""Extraction-rule admin router (docs/05 S7).

`/admin/extraction-rules` — CRUD plus a `POST .../test` that compiles a candidate
pattern against sample text and returns match spans, so the editor can highlight
hits live before the rule is saved.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.responses import success
from app.core.database import get_session
from app.core.exceptions import ValidationFailed
from app.modules.auth.dependencies import CurrentUser, require
from app.modules.ingestion.rules_engine import InvalidPattern, test_pattern
from app.modules.ingestion.rules_schemas import (
    RuleCreate,
    RuleRead,
    RuleTestRequest,
    RuleUpdate,
)
from app.modules.ingestion.rules_service import ExtractionRuleService

router = APIRouter(prefix="/admin/extraction-rules", tags=["extraction-rules"])

PERM = "extraction_rules.manage"


@router.get("", summary="List extraction rules")
async def list_rules(
    entity_type: str | None = Query(None),
    is_active: bool | None = Query(None),
    actor: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    rows = await ExtractionRuleService(session, actor.tenant_id).list(
        entity_type=entity_type, is_active=is_active)
    return success([RuleRead.model_validate(r).model_dump() for r in rows])


@router.post("", status_code=201, summary="Create an extraction rule")
async def create_rule(
    body: RuleCreate,
    actor: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    svc = ExtractionRuleService(session, actor.tenant_id)
    row = await svc.create(body, actor.id)
    await session.commit()
    return success(RuleRead.model_validate(row).model_dump())


@router.post("/test", summary="Test a pattern against sample text")
async def test_rule(
    body: RuleTestRequest,
    _: CurrentUser = Depends(require(PERM)),
) -> dict:
    """Stateless preview — compiles nothing into the DB. An invalid or runaway
    pattern comes back as a 422 the editor renders inline rather than a 500."""
    try:
        matches = await test_pattern(body.method, body.pattern, body.sample_text,
                                     entity_type=body.entity_type, confidence=body.confidence)
    except InvalidPattern as exc:
        raise ValidationFailed(str(exc), code="EXTRACTION_RULE_INVALID_PATTERN",
                               http_status=422) from exc
    return success({
        "match_count": len(matches),
        "matches": [{"value": m.value, "start": m.start, "end": m.end,
                     "confidence": m.confidence} for m in matches],
    })


@router.get("/{rule_id}", summary="Get an extraction rule")
async def get_rule(
    rule_id: uuid.UUID,
    actor: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    row = await ExtractionRuleService(session, actor.tenant_id).get(rule_id)
    return success(RuleRead.model_validate(row).model_dump())


@router.patch("/{rule_id}", summary="Update an extraction rule (bumps version)")
async def update_rule(
    rule_id: uuid.UUID,
    body: RuleUpdate,
    actor: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    svc = ExtractionRuleService(session, actor.tenant_id)
    row = await svc.update(rule_id, body, actor.id)
    await session.commit()
    # `updated_at` is computed DB-side by its onupdate, so it comes back unloaded
    # after an UPDATE (unlike an INSERT, where RETURNING fetches server defaults).
    # Refresh explicitly: model_validate is synchronous and would otherwise trip a
    # lazy load outside the greenlet context (MissingGreenlet).
    await session.refresh(row)
    return success(RuleRead.model_validate(row).model_dump())


@router.delete("/{rule_id}", status_code=204, summary="Delete an extraction rule")
async def delete_rule(
    rule_id: uuid.UUID,
    actor: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
):
    svc = ExtractionRuleService(session, actor.tenant_id)
    await svc.delete(rule_id)
    await session.commit()
