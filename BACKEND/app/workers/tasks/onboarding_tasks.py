"""Sample-data seeding Celery task (docs/05 S10).

Runs on `ingestion`: seeding uploads and ingests the demo corpus, so it is the
same CPU/IO work the ingestion queue already sizes for — not a quick notify job.
"""

from __future__ import annotations

import asyncio

from app.core.logging import get_logger

# Register cross-module models so SQLAlchemy resolves relationships in the worker.
from app.modules.auth import models as _auth  # noqa: E402,F401
from app.modules.onboarding import models as _onboarding  # noqa: E402,F401
from app.modules.tenants import models as _tenants  # noqa: E402,F401
from app.modules.users import models as _users  # noqa: E402,F401
from app.workers.celery_app import celery

log = get_logger("workers.onboarding")


@celery.task(name="app.workers.tasks.onboarding_tasks.seed_demo_task")
def seed_demo_task(tenant_id: str) -> dict:
    from app.modules.onboarding.service import run_seed_demo

    return asyncio.run(run_seed_demo(tenant_id))
