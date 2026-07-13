"""HTTP middleware — request-id + request/response logging (docs/02 §3, §28).

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

from app.core.logging import get_logger, request_id_ctx

log = get_logger("http")

REQUEST_ID_HEADER = "X-Request-ID"


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Assign/propagate a request id, bind it to log context, time the request."""

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get(REQUEST_ID_HEADER) or uuid.uuid4().hex
        token = request_id_ctx.set(request_id)
        request.state.request_id = request_id
        start = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            log.info(
                "request",
                method=request.method,
                path=request.url.path,
                status=getattr(request.state, "_status", None),
                duration_ms=duration_ms,
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
