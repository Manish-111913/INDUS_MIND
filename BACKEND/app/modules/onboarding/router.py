"""Onboarding router (docs/05 S10).

`GET /tours/{code}` and `GET /changelog` are open to any authenticated user (the
shell needs them at boot). Authoring is gated by `tours.manage`; loading sample
data by `demo.seed`.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.responses import success
from app.core.database import get_session
from app.modules.auth.dependencies import CurrentUser, get_current_user, require
from app.modules.onboarding.schemas import (
    ChangelogRead,
    ChangelogWrite,
    TourRead,
    TourWrite,
)
from app.modules.onboarding.service import ChangelogService, TourService

router = APIRouter(tags=["onboarding"])

TOURS_PERM = "tours.manage"
SEED_PERM = "demo.seed"


# ── read paths (any authenticated user) ──────────────────────────────────────
@router.get("/tours/{code}", summary="Get a guided tour by code")
async def get_tour(
    code: str,
    current: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    row = await TourService(session, current.tenant_id).get_by_code(code)
    return success(TourRead.model_validate(row).model_dump())


@router.get("/changelog", summary="What's new")
async def get_changelog(
    limit: int = Query(20, ge=1, le=100),
    current: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    rows = await ChangelogService(session, current.tenant_id).list(limit=limit)
    return success([ChangelogRead.model_validate(r).model_dump() for r in rows])


# ── admin: tours ─────────────────────────────────────────────────────────────
@router.get("/admin/tours", summary="List tours")
async def list_tours(
    actor: CurrentUser = Depends(require(TOURS_PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    rows = await TourService(session, actor.tenant_id).list()
    return success([TourRead.model_validate(r).model_dump() for r in rows])


@router.post("/admin/tours", status_code=201, summary="Create a tour")
async def create_tour(
    body: TourWrite,
    actor: CurrentUser = Depends(require(TOURS_PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    row = await TourService(session, actor.tenant_id).create(body, actor.id)
    await session.commit()
    return success(TourRead.model_validate(row).model_dump())


@router.put("/admin/tours/{tour_id}", summary="Replace a tour and its steps")
async def update_tour(
    tour_id: uuid.UUID,
    body: TourWrite,
    actor: CurrentUser = Depends(require(TOURS_PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    row = await TourService(session, actor.tenant_id).update(tour_id, body, actor.id)
    await session.commit()
    return success(TourRead.model_validate(row).model_dump())


@router.delete("/admin/tours/{tour_id}", status_code=204, summary="Delete a tour")
async def delete_tour(
    tour_id: uuid.UUID,
    actor: CurrentUser = Depends(require(TOURS_PERM)),
    session: AsyncSession = Depends(get_session),
) -> None:
    await TourService(session, actor.tenant_id).delete(tour_id)
    await session.commit()


# ── admin: changelog ─────────────────────────────────────────────────────────
@router.get("/admin/changelog", summary="List changelog entries (incl. drafts)")
async def admin_list_changelog(
    actor: CurrentUser = Depends(require(TOURS_PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    rows = await ChangelogService(session, actor.tenant_id).list(published_only=False, limit=100)
    return success([ChangelogRead.model_validate(r).model_dump() for r in rows])


@router.post("/admin/changelog", status_code=201, summary="Create a changelog entry")
async def create_changelog(
    body: ChangelogWrite,
    actor: CurrentUser = Depends(require(TOURS_PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    row = await ChangelogService(session, actor.tenant_id).create(body, actor.id)
    await session.commit()
    return success(ChangelogRead.model_validate(row).model_dump())


@router.patch("/admin/changelog/{entry_id}", summary="Update a changelog entry")
async def update_changelog(
    entry_id: uuid.UUID,
    body: ChangelogWrite,
    actor: CurrentUser = Depends(require(TOURS_PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    svc = ChangelogService(session, actor.tenant_id)
    row = await svc.update(entry_id, body, actor.id)
    await session.commit()
    await session.refresh(row)
    return success(ChangelogRead.model_validate(row).model_dump())


@router.delete("/admin/changelog/{entry_id}", status_code=204, summary="Delete a changelog entry")
async def delete_changelog(
    entry_id: uuid.UUID,
    actor: CurrentUser = Depends(require(TOURS_PERM)),
    session: AsyncSession = Depends(get_session),
) -> None:
    await ChangelogService(session, actor.tenant_id).delete(entry_id)
    await session.commit()


# ── admin: sample data ───────────────────────────────────────────────────────
@router.post("/admin/seed-demo", status_code=202, summary="Load sample plant data")
async def seed_demo(
    actor: CurrentUser = Depends(require(SEED_PERM)),
) -> dict:
    """202 + a job id: seeding ingests documents and takes far longer than a
    request should. Idempotent — a concurrent run is rejected by an advisory lock
    in the task, and the seed itself only inserts what's missing."""
    from app.workers.tasks.onboarding_tasks import seed_demo_task

    result = seed_demo_task.delay(str(actor.tenant_id))
    return success({
        "job_id": str(result.id),
        "status": "queued",
        "detail": "Sample plant data is loading; this takes a minute.",
    })
