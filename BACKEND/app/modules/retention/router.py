"""Retention admin router (docs/08 S14) — /admin/retention. Permission retention.manage."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.responses import success
from app.core.database import get_session
from app.modules.auth.dependencies import CurrentUser, require
from app.modules.retention.models import RETENTION_ENTITIES, RetentionPolicy
from app.modules.retention.service import RetentionService

router = APIRouter(prefix="/admin/retention", tags=["retention"])
PERM = "retention.manage"


class RetentionWrite(BaseModel):
    entity: str = Field(description=f"One of: {', '.join(RETENTION_ENTITIES)}")
    keep_days: int = Field(ge=1, le=36500)
    action: str = Field(pattern=r"^(archive|delete)$")
    is_active: bool = True


def _read(p: RetentionPolicy) -> dict:
    return {"id": str(p.id), "entity": p.entity, "keep_days": p.keep_days, "action": p.action,
            "is_active": p.is_active,
            "last_run_at": p.last_run_at.isoformat() if p.last_run_at else None,
            "last_affected": p.last_affected}


@router.get("", summary="List retention policies")
async def list_policies(
    actor: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    rows = await RetentionService(session, actor.tenant_id).list()
    return success([_read(r) for r in rows])


@router.put("", summary="Create or update a retention policy")
async def upsert_policy(
    body: RetentionWrite,
    actor: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    svc = RetentionService(session, actor.tenant_id)
    row = await svc.upsert(entity=body.entity, keep_days=body.keep_days, action=body.action,
                           is_active=body.is_active, actor_id=actor.id)
    await session.commit()
    await session.refresh(row)
    return success(_read(row))


@router.delete("/{policy_id}", status_code=204, summary="Delete a retention policy")
async def delete_policy(
    policy_id: uuid.UUID,
    actor: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> None:
    await RetentionService(session, actor.tenant_id).delete(policy_id)
    await session.commit()


@router.post("/{policy_id}/run", summary="Run a retention policy now")
async def run_policy(
    policy_id: uuid.UUID,
    actor: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    svc = RetentionService(session, actor.tenant_id)
    policy = await svc.get(policy_id)
    affected = await svc.run(policy)
    return success({"entity": policy.entity, "action": policy.action, "affected": affected})
