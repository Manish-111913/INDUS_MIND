"""/api/v1 aggregate router (docs/02 §3, §13, §44).

Mounts every module router. Modules register here as they land (auth, users,
equipment, documents, ingestion, knowledge, ai, maintenance, compliance,
quality, lessons, notifications, dashboards, analytics, audit, lookups). The
scaffold ships the mount point + a version probe so the contract surface exists
from day one.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.common.responses import success
from app.modules.ai.ai_router import router as ai_router
from app.modules.ai.chat_router import router as chat_router
from app.modules.ai.rca_router import router as rca_router
from app.modules.analytics.router import router as analytics_router
from app.modules.audit.router import router as audit_router
from app.modules.auth.router import router as auth_router
from app.modules.compliance.router import router as compliance_router
from app.modules.dashboards.router import router as dashboards_router
from app.modules.documents.router import router as documents_router
from app.modules.equipment.router import router as equipment_router
from app.modules.ingestion.entities_router import router as entities_router
from app.modules.ingestion.router import router as ingestion_router
from app.modules.knowledge.router import router as knowledge_router
from app.modules.knowledge.search_router import router as search_router
from app.modules.lessons.router import router as lessons_router
from app.modules.lookups.router import router as lookups_router
from app.modules.maintenance.router import router as maintenance_router
from app.modules.notifications.router import router as notifications_router
from app.modules.quality.router import router as quality_router
from app.modules.users.router import router as users_router

api_router = APIRouter(prefix="/api/v1")


@api_router.get("/", tags=["meta"], summary="API v1 root / version probe")
async def api_root() -> dict:
    return success({"api": "indusmind", "version": "v1"})


# ── module routers ───────────────────────────────────────────────────────────
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(lookups_router)
api_router.include_router(equipment_router)
api_router.include_router(documents_router)
api_router.include_router(ingestion_router)
api_router.include_router(entities_router)
api_router.include_router(knowledge_router)
api_router.include_router(search_router)
api_router.include_router(ai_router)
api_router.include_router(chat_router)
api_router.include_router(rca_router)
api_router.include_router(audit_router)
api_router.include_router(maintenance_router)
api_router.include_router(compliance_router)
api_router.include_router(quality_router)
api_router.include_router(lessons_router)
api_router.include_router(notifications_router)
api_router.include_router(dashboards_router)
api_router.include_router(analytics_router)
