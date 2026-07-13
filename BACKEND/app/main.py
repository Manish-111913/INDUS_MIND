"""FastAPI application entrypoint (docs/02 §3, §13, §29).

Wires: structlog JSON logging, request-id middleware, strict CORS, global
exception handlers producing the §13 error envelope, the /api/v1 router, and the
liveness/readiness probes. Auth → tenant → RBAC → rate-limit middlewares slot in
(in that order, outermost-first) as their modules land.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.api.v1.router import api_router
from app.core import database, redis, storage
from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging, get_logger
from app.core.middleware import RequestContextMiddleware

configure_logging(settings.log_level)
log = get_logger("main")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    log.info("startup", app_env=settings.app_env)
    yield
    await redis.close_redis()
    log.info("shutdown")


app = FastAPI(
    title="IndusMind API",
    version="0.1.0",
    description="AI-Powered Industrial Knowledge Intelligence Platform — REST API (/api/v1).",
    docs_url="/docs",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# ── middleware (outermost added last) ────────────────────────────────────────
app.add_middleware(RequestContextMiddleware)
# Signed session cookie — required by the OAuth (authlib) redirect/callback flow.
app.add_middleware(SessionMiddleware, secret_key=settings.secret_key, same_site="lax")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)

register_exception_handlers(app)
app.include_router(api_router)


# ── health / readiness (docs/02 §29) ─────────────────────────────────────────
@app.get("/healthz", tags=["meta"], summary="Liveness probe")
async def healthz() -> dict:
    return {"status": "ok"}


@app.get("/readyz", tags=["meta"], summary="Readiness probe (postgres, redis, neo4j, minio)")
async def readyz():
    from fastapi.responses import JSONResponse

    checks: dict[str, str] = {}

    async def _run(name: str, coro_or_fn, is_async: bool) -> None:
        try:
            await coro_or_fn() if is_async else coro_or_fn()
            checks[name] = "ok"
        except Exception as exc:  # noqa: BLE001 — report, don't crash the probe
            checks[name] = f"error: {type(exc).__name__}"

    await _run("postgres", database.ping, True)
    await _run("redis", redis.ping, True)
    await _run("neo4j", _neo4j_ping, True)
    await _run("minio", storage.ping, False)

    ok = all(v == "ok" for v in checks.values())
    return JSONResponse(
        status_code=200 if ok else 503,
        content={"status": "ok" if ok else "degraded", "checks": checks},
    )


async def _neo4j_ping() -> None:
    from neo4j import AsyncGraphDatabase

    driver = AsyncGraphDatabase.driver(
        settings.neo4j_uri, auth=(settings.neo4j_user, settings.neo4j_password)
    )
    try:
        await driver.verify_connectivity()
    finally:
        await driver.close()
