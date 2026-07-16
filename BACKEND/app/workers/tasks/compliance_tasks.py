"""Compliance Celery tasks (docs/02 §19, §33).

`generate_evidence_package` is the job body dispatched by
`POST /compliance/evidence-packages`: it renders the coverage PDF + ZIP of cited
sources, stores them to S3 and flips the package to ready (publishing WS progress
+ a notification). Runs on the `ai` queue (IO-bound: S3 + document reads).
"""

from __future__ import annotations

import asyncio
import uuid

from app.core.logging import get_logger

# Register cross-module models so SQLAlchemy resolves relationships in the worker.
from app.modules.auth import models as _auth  # noqa: E402,F401
from app.modules.compliance import models as _compliance  # noqa: E402,F401
from app.modules.documents import models as _documents  # noqa: E402,F401
from app.modules.equipment import models as _equipment  # noqa: E402,F401
from app.modules.ingestion import models as _ingestion  # noqa: E402,F401
from app.modules.maintenance import models as _maintenance  # noqa: E402,F401
from app.modules.tenants import models as _tenants  # noqa: E402,F401
from app.modules.users import models as _users  # noqa: E402,F401
from app.workers.celery_app import celery

log = get_logger("workers.compliance")


async def _run_generate(tenant_id: str, package_id: str) -> dict:
    from app.core.database import SessionFactory
    from app.modules.compliance.evidence import EvidenceService

    async with SessionFactory() as session:
        package = await EvidenceService(session, tenant_id).generate(uuid.UUID(package_id))
        await session.commit()
        return {"package_id": package_id, "status": package.status}


@celery.task(name="app.workers.tasks.compliance_tasks.generate_evidence_package")
def generate_evidence_package(tenant_id: str, package_id: str) -> dict:
    """Render + store an evidence package (docs/02 §19)."""
    result = asyncio.run(_run_generate(tenant_id, package_id))
    log.info("evidence_package_done", **result)
    return result
