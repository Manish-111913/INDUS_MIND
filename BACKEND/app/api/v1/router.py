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
from app.modules.auth.router import router as auth_router

api_router = APIRouter(prefix="/api/v1")


@api_router.get("/", tags=["meta"], summary="API v1 root / version probe")
async def api_root() -> dict:
    return success({"api": "indusmind", "version": "v1"})


# ── module routers ───────────────────────────────────────────────────────────
api_router.include_router(auth_router)
# users, equipment, documents, ... register here as they are implemented.
