"""HTTP middleware — request-id + request/response logging + security headers
(docs/02 §3, §28, §39).

Auth → tenant ctx → RBAC → rate-limit middlewares are added as the respective
modules land; the ordering seam is documented in main.py. Bodies are never
logged (PII); only method/path/status/latency.
"""

from __future__ import annotations

import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings
from app.core.logging import get_logger, request_id_ctx

log = get_logger("http")

REQUEST_ID_HEADER = "X-Request-ID"

# Static response headers applied to every response (docs/02 §39 — security
# headers). The CSP is deliberately strict: this host serves a JSON API plus the
# self-contained Swagger UI at /docs, neither of which needs third-party origins.
# HSTS is only emitted in production (local runs are plain http, where the header
# is meaningless and would pin http→https on localhost).
_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    "Content-Security-Policy": (
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; "
        "img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
        "script-src 'self' 'unsafe-inline'; connect-src 'self'"
    ),
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Attach hardening headers to every response (docs/02 §39)."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        for header, value in _SECURITY_HEADERS.items():
            response.headers.setdefault(header, value)
        if settings.app_env == "production":
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload"
            )
        return response


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Assign/propagate a request id, bind it to log context, time the request."""

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get(REQUEST_ID_HEADER) or uuid.uuid4().hex
        token = request_id_ctx.set(request_id)
        request.state.request_id = request_id
        start = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
        finally:
            duration_s = time.perf_counter() - start
            if settings.metrics_enabled:
                from app.core import metrics

                metrics.observe_request(
                    request.method, metrics.route_template(request), status_code, duration_s
                )
            log.info(
                "request",
                method=request.method,
                path=request.url.path,
                status=getattr(request.state, "_status", None),
                duration_ms=round(duration_s * 1000, 2),
            )
            request_id_ctx.reset(token)
        response.headers[REQUEST_ID_HEADER] = request_id
        request.state._status = response.status_code
        log.info(
            "response",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
        )
        return response
