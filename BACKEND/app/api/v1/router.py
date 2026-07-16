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
from app.modules.ai.observability_router import router as ai_observability_router
from app.modules.ai.rca_router import router as rca_router
from app.modules.analytics.router import router as analytics_router
from app.modules.audit.router import admin_router as audit_admin_router
from app.modules.audit.router import router as audit_router
from app.modules.auth.router import me_router as auth_me_router
from app.modules.auth.router import router as auth_router
from app.modules.bulk.router import router as bulk_router
from app.modules.compliance.router import router as compliance_router
from app.modules.content.router import router as content_router
from app.modules.dashboards.router import router as dashboards_router
from app.modules.dataops.router import export_router, import_router
from app.modules.dataops.router import report_router as reports_router
from app.modules.documents.router import router as documents_router
from app.modules.equipment.qr_router import router as equipment_qr_router
from app.modules.equipment.router import router as equipment_router
from app.modules.i18n.router import router as i18n_router
from app.modules.ingestion.entities_router import router as entities_router
from app.modules.ingestion.router import router as ingestion_router
from app.modules.ingestion.rules_router import router as extraction_rules_router
from app.modules.integrations.router import router as integrations_router
from app.modules.knowledge.router import router as knowledge_router
from app.modules.knowledge.search_router import router as search_router
from app.modules.lessons.router import router as lessons_router
from app.modules.logbook.router import router as logbook_router
from app.modules.lookups.router import router as lookups_router
from app.modules.maintenance.router import router as maintenance_router
from app.modules.meters.router import router as meters_router
from app.modules.navigation.router import router as navigation_router
from app.modules.notifications.router import admin_router as notification_templates_router
from app.modules.notifications.router import me_router as notification_me_router
from app.modules.notifications.router import router as notifications_router
from app.modules.onboarding.router import router as onboarding_router
from app.modules.parts.router import router as parts_router
from app.modules.preferences.router import router as preferences_router
from app.modules.quality.router import router as quality_router
from app.modules.retention.router import router as retention_router
from app.modules.settings.router import router as settings_router
from app.modules.users.router import router as users_router

api_router = APIRouter(prefix="/api/v1")


@api_router.get("/", tags=["meta"], summary="API v1 root / version probe")
async def api_root() -> dict:
    return success({"api": "indusmind", "version": "v1"})


# ── module routers ───────────────────────────────────────────────────────────
api_router.include_router(auth_router)
api_router.include_router(auth_me_router)
api_router.include_router(navigation_router)
api_router.include_router(users_router)
api_router.include_router(settings_router)
api_router.include_router(preferences_router)
api_router.include_router(lookups_router)
api_router.include_router(equipment_qr_router)  # before equipment_router: by-code/qr specificity
api_router.include_router(equipment_router)
api_router.include_router(documents_router)
api_router.include_router(ingestion_router)
api_router.include_router(entities_router)
api_router.include_router(extraction_rules_router)
api_router.include_router(integrations_router)
api_router.include_router(onboarding_router)
api_router.include_router(parts_router)
api_router.include_router(i18n_router)
api_router.include_router(logbook_router)
api_router.include_router(retention_router)
api_router.include_router(content_router)
api_router.include_router(bulk_router)
api_router.include_router(knowledge_router)
api_router.include_router(search_router)
api_router.include_router(ai_router)
api_router.include_router(chat_router)
api_router.include_router(rca_router)
api_router.include_router(ai_observability_router)
api_router.include_router(audit_router)
api_router.include_router(audit_admin_router)
api_router.include_router(maintenance_router)
api_router.include_router(meters_router)
api_router.include_router(compliance_router)
api_router.include_router(quality_router)
api_router.include_router(lessons_router)
api_router.include_router(notifications_router)
api_router.include_router(notification_me_router)
api_router.include_router(notification_templates_router)
api_router.include_router(dashboards_router)
api_router.include_router(analytics_router)
# Import / export / reporting engine (docs/05 S6).
api_router.include_router(import_router)
api_router.include_router(export_router)
api_router.include_router(reports_router)
