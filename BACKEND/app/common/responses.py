"""Response envelope helpers (docs/02 §13).

Success:  { "data": …, "meta": {pagination?} }
Error:    { "error": { code, message, field_errors?, request_id } }  (see core/exceptions)
"""

from __future__ import annotations

from typing import Any

from app.core.logging import request_id_ctx


def success(data: Any, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"data": data}
    if meta:
        body["meta"] = meta
    return body


def error_envelope(
    code: str, message: str, *, field_errors: dict[str, Any] | None = None
) -> dict[str, Any]:
    err: dict[str, Any] = {"code": code, "message": message}
    if field_errors:
        err["field_errors"] = field_errors
    err["request_id"] = request_id_ctx.get()
    return {"error": err}
