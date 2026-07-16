"""Tours, changelog and demo-data seeding (docs/05 S10)."""

from __future__ import annotations

import uuid

from sqlalchemy import or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFound
from app.core.logging import get_logger
from app.modules.onboarding.models import ChangelogEntry, Tour, TourStep
from app.modules.onboarding.schemas import TourWrite

log = get_logger("onboarding")

# Namespace for pg_advisory_lock so seed-demo can't collide with another
# feature's advisory lock. Arbitrary but must stay stable.
SEED_DEMO_LOCK_NAMESPACE = 0x1D05


def seed_demo_lock_key(tenant_id: uuid.UUID | str) -> int:
    """A stable per-tenant 32-bit lock id for pg_try_advisory_lock(int, int).

    The tenant UUID is hashed down to 32 bits: advisory locks take integers, and a
    collision is harmless here (worst case two different tenants serialise against
    each other for the duration of one seed).
    """
    return uuid.UUID(str(tenant_id)).int % (2**31)


class TourService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    async def get_by_code(self, code: str) -> Tour:
        """Tenant override wins over the system-provided tour of the same code."""
        stmt = (
            select(Tour)
            .where(Tour.code == code, Tour.is_active.is_(True),
                   or_(Tour.tenant_id == self.tenant_id, Tour.tenant_id.is_(None)))
            # NULLS LAST puts the tenant's own row first.
            .order_by(Tour.tenant_id.desc().nulls_last())
        )
        row = (await self.session.execute(stmt)).scalars().first()
        if row is None:
            raise NotFound(f"Tour '{code}' not found", code="TOUR_NOT_FOUND")
        return row

    async def list(self) -> list[Tour]:
        stmt = (select(Tour)
                .where(or_(Tour.tenant_id == self.tenant_id, Tour.tenant_id.is_(None)))
                .order_by(Tour.code))
        return list((await self.session.execute(stmt)).scalars().all())

    async def get(self, tour_id: uuid.UUID) -> Tour:
        row = (await self.session.execute(
            select(Tour).where(Tour.id == tour_id))).scalar_one_or_none()
        if row is None or (row.tenant_id not in (None, self.tenant_id)):
            raise NotFound("Tour not found", code="TOUR_NOT_FOUND")
        return row

    async def create(self, body: TourWrite, actor_id: uuid.UUID) -> Tour:
        row = Tour(tenant_id=self.tenant_id, code=body.code, name=body.name,
                   description=body.description, role_scope=body.role_scope,
                   is_active=body.is_active, created_by=actor_id, updated_by=actor_id)
        row.steps = [TourStep(**s.model_dump(), created_by=actor_id, updated_by=actor_id)
                     for s in body.steps]
        self.session.add(row)
        await self.session.flush()
        return row

    async def update(self, tour_id: uuid.UUID, body: TourWrite, actor_id: uuid.UUID) -> Tour:
        row = await self.get(tour_id)
        if row.tenant_id is None:
            # A system tour is shared across tenants; editing it in place would
            # change every tenant's tour. Copy-on-write into this tenant instead.
            return await self.create(body, actor_id)
        for field in ("code", "name", "description", "role_scope", "is_active"):
            setattr(row, field, getattr(body, field))
        # Replace steps wholesale: cascade delete-orphan clears the old ones, which
        # avoids order_no collisions during a partial update.
        row.steps = [TourStep(**s.model_dump(), created_by=actor_id, updated_by=actor_id)
                     for s in body.steps]
        row.updated_by = actor_id
        await self.session.flush()
        return row

    async def delete(self, tour_id: uuid.UUID) -> None:
        row = await self.get(tour_id)
        if row.tenant_id is None:
            raise NotFound("Cannot delete a system tour", code="TOUR_NOT_FOUND")
        await self.session.delete(row)
        await self.session.flush()


class ChangelogService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    async def list(self, *, published_only: bool = True, limit: int = 20) -> list[ChangelogEntry]:
        stmt = select(ChangelogEntry).where(
            or_(ChangelogEntry.tenant_id == self.tenant_id, ChangelogEntry.tenant_id.is_(None)))
        if published_only:
            stmt = stmt.where(ChangelogEntry.is_published.is_(True))
        stmt = stmt.order_by(ChangelogEntry.released_at.desc()).limit(limit)
        return list((await self.session.execute(stmt)).scalars().all())

    async def get(self, entry_id: uuid.UUID) -> ChangelogEntry:
        row = (await self.session.execute(
            select(ChangelogEntry).where(ChangelogEntry.id == entry_id))).scalar_one_or_none()
        if row is None or (row.tenant_id not in (None, self.tenant_id)):
            raise NotFound("Changelog entry not found", code="CHANGELOG_NOT_FOUND")
        return row

    async def create(self, body, actor_id: uuid.UUID) -> ChangelogEntry:
        data = body.model_dump(exclude_none=True)
        row = ChangelogEntry(tenant_id=self.tenant_id, created_by=actor_id,
                             updated_by=actor_id, **data)
        self.session.add(row)
        await self.session.flush()
        return row

    async def update(self, entry_id: uuid.UUID, body, actor_id: uuid.UUID) -> ChangelogEntry:
        row = await self.get(entry_id)
        for field, value in body.model_dump(exclude_unset=True, exclude_none=True).items():
            setattr(row, field, value)
        row.updated_by = actor_id
        await self.session.flush()
        return row

    async def delete(self, entry_id: uuid.UUID) -> None:
        row = await self.get(entry_id)
        if row.tenant_id is None:
            raise NotFound("Cannot delete a system changelog entry", code="CHANGELOG_NOT_FOUND")
        await self.session.delete(row)
        await self.session.flush()


async def try_seed_demo_lock(session: AsyncSession, tenant_id: uuid.UUID | str) -> bool:
    """Take the per-tenant seed lock, or False if a run is already in flight.

    `pg_try_advisory_lock` (not the blocking variant) is what makes the endpoint
    idempotent under concurrency: a second click returns "already running" instead
    of queueing a duplicate seed. The lock is session-scoped, so it is released
    when the connection closes — including if the worker dies mid-run, which stops
    a crashed seed from wedging the tenant forever.
    """
    got = await session.execute(
        text("SELECT pg_try_advisory_lock(:ns, :key)"),
        {"ns": SEED_DEMO_LOCK_NAMESPACE, "key": seed_demo_lock_key(tenant_id)})
    return bool(got.scalar())


async def release_seed_demo_lock(session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
    await session.execute(
        text("SELECT pg_advisory_unlock(:ns, :key)"),
        {"ns": SEED_DEMO_LOCK_NAMESPACE, "key": seed_demo_lock_key(tenant_id)})


async def run_seed_demo(tenant_id: uuid.UUID | str) -> dict:
    """Load sample plant data for a tenant (docs/05 S10).

    Idempotent twice over: the advisory lock stops concurrent runs, and the seed
    script itself only inserts what's missing, so a repeat run is a no-op rather
    than a duplicate plant.
    """
    from app.core.database import SessionFactory
    from seeds.seed import run as seed_run

    async with SessionFactory() as session:
        if not await try_seed_demo_lock(session, tenant_id):
            log.info("seed_demo_already_running", tenant_id=str(tenant_id))
            return {"status": "already_running", "tenant_id": str(tenant_id)}
        try:
            await seed_run(with_documents=True)
            log.info("seed_demo_done", tenant_id=str(tenant_id))
            return {"status": "completed", "tenant_id": str(tenant_id)}
        finally:
            await release_seed_demo_lock(session, tenant_id)
