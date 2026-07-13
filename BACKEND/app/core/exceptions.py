"""Exception hierarchy + global handlers → error envelope (docs/02 §13, §30).

Error envelope (single source of truth):
    { "error": { "code", "message", "field_errors"?, "request_id" } }
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import get_logger, request_id_ctx

log = get_logger("core.exceptions")


class AppError(Exception):
    """Base application error → maps directly onto the error envelope."""

    code: str = "INTERNAL"
    http_status: int = 500
    message: str = "Internal server error"

    def __init__(
        self,
        message: str | None = None,
        *,
        code: str | None = None,
        http_status: int | None = None,
        field_errors: dict[str, Any] | None = None,
    ) -> None:
        self.message = message or self.message
        if code is not None:
            self.code = code
        if http_status is not None:
            self.http_status = http_status
        self.field_errors = field_errors
        super().__init__(self.message)


class NotFound(AppError):
    code, http_status, message = "NOT_FOUND", 404, "Resource not found"


class PermissionDenied(AppError):
    code, http_status, message = "PERMISSION_DENIED", 403, "Permission denied"


class Unauthenticated(AppError):
    code, http_status, message = "UNAUTHENTICATED", 401, "Authentication required"


class TokenExpired(AppError):
    code, http_status, message = "TOKEN_EXPIRED", 401, "Access token expired"


class ValidationFailed(AppError):
    code, http_status, message = "VALIDATION_ERROR", 400, "Validation error"


class ConflictError(AppError):
    code, http_status, message = "CONFLICT", 409, "Conflict"


class VersionMismatch(ConflictError):
    code, http_status, message = "VERSION_MISMATCH", 409, "Optimistic lock version mismatch"


class RateLimited(AppError):
    code, http_status, message = "RATE_LIMITED", 429, "Rate limit exceeded"


class ExternalServiceError(AppError):
    code, http_status, message = "EXTERNAL_SERVICE_ERROR", 502, "Upstream service error"


def _envelope(
    code: str, message: str, *, field_errors: dict[str, Any] | None = None
) -> dict[str, Any]:
    err: dict[str, Any] = {"code": code, "message": message}
    if field_errors:
        err["field_errors"] = field_errors
    err["request_id"] = request_id_ctx.get()
    return {"error": err}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_request: Request, exc: AppError) -> JSONResponse:
        headers = {"Retry-After": "60"} if isinstance(exc, RateLimited) else None
        return JSONResponse(
            status_code=exc.http_status,
            content=_envelope(exc.code, exc.message, field_errors=exc.field_errors),
            headers=headers,
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_request: Request, exc: RequestValidationError) -> JSONResponse:
        field_errors: dict[str, Any] = {}
        for e in exc.errors():
            loc = ".".join(str(p) for p in e["loc"] if p not in ("body", "query", "path"))
            field_errors.setdefault(loc or "_", e["msg"])
        return JSONResponse(
            status_code=422,
            content=_envelope("VALIDATION_ERROR", "Request validation failed",
                              field_errors=field_errors),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {
            401: "UNAUTHENTICATED",
            403: "PERMISSION_DENIED",
            404: "NOT_FOUND",
            409: "CONFLICT",
            429: "RATE_LIMITED",
        }.get(exc.status_code, "ERROR")
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope(code, str(exc.detail)),
        )

    @app.exception_handler(Exception)
    async def _unexpected(_request: Request, exc: Exception) -> JSONResponse:
        # Opaque 500 to the client; full detail to logs / Sentry.
        log.error("unhandled_exception", error=str(exc), exc_info=exc)
        return JSONResponse(
            status_code=500,
            content=_envelope("INTERNAL", "Internal server error"),
        )
