"""Retention beat task (docs/08 S14).

Nightly: run every active retention policy across all tenants. Each policy runs in
its own session and is isolated, so one tenant's failure doesn't stop the sweep.
"""

from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.core.logging import get_logger

# Register cross-module models so SQLAlchemy resolves relationships in the worker.
from app.modules.auth import models as _auth  # noqa: E402,F401
from app.modules.retention import models as _retention  # noqa: E402,F401
from app.modules.tenants import models as _tenants  # noqa: E402,F401
from app.workers.celery_app import celery

log = get_logger("workers.retention")


async def _run_all() -> int:
    from app.core.database import SessionFactory
    from app.modules.retention.models import RetentionPolicy
    from app.modules.retention.service import RetentionService

    async with SessionFactory() as session:
        policies = (await session.execute(
            select(RetentionPolicy).where(RetentionPolicy.is_active.is_(True)))).scalars().all()
        specs = [(p.id, p.tenant_id) for p in policies]

    total = 0
    for policy_id, tenant_id in specs:
        try:
            async with SessionFactory() as session:
                svc = RetentionService(session, tenant_id)
                policy = await svc.get(policy_id)
                total += await svc.run(policy)
        except Exception as exc:  # noqa: BLE001 — one policy failing must not stop the sweep
            log.warning("retention_policy_failed", policy_id=str(policy_id), error=str(exc))
    log.info("retention_sweep_done", policies=len(specs), affected=total)
    return total


@celery.task(name="app.workers.tasks.retention_tasks.run_retention_policies")
def run_retention_policies() -> int:
    return asyncio.run(_run_all())
