"""structlog JSON logging → stdout (docs/02 §28).

Log line shape: {ts, level, request_id, tenant_id, user_id, module, event, ...}.
Request-id / tenant / user are bound per-request by middleware via contextvars.
"""

from __future__ import annotations

import logging
import sys
from contextvars import ContextVar

import structlog
from structlog.typing import EventDict, WrappedLogger

# Per-request context, bound by middleware and merged into every log line.
request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)
tenant_id_ctx: ContextVar[str | None] = ContextVar("tenant_id", default=None)
user_id_ctx: ContextVar[str | None] = ContextVar("user_id", default=None)


def _merge_context(_logger: WrappedLogger, _method: str, event_dict: EventDict) -> EventDict:
    if (rid := request_id_ctx.get()) is not None:
        event_dict.setdefault("request_id", rid)
    if (tid := tenant_id_ctx.get()) is not None:
        event_dict.setdefault("tenant_id", tid)
    if (uid := user_id_ctx.get()) is not None:
        event_dict.setdefault("user_id", uid)
    return event_dict


def configure_logging(level: str = "INFO") -> None:
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level.upper())
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            _merge_context,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", key="ts"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelName(level.upper())
        ),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(module: str) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger().bind(module=module)
