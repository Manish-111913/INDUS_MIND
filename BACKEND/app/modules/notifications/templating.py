"""Sandboxed Jinja2 renderer for notification templates (docs/05 S3).

Templates are authored in the DB (system + tenant overrides), so rendering runs
inside a `SandboxedEnvironment` — attribute access to Python internals is blocked
and an undefined variable renders empty rather than raising. This keeps a
tenant-authored template from being an injection or crash vector.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from jinja2 import ChainableUndefined
from jinja2.sandbox import SandboxedEnvironment

from app.core.logging import get_logger

log = get_logger("notifications.templating")


@lru_cache(maxsize=1)
def _env() -> SandboxedEnvironment:
    return SandboxedEnvironment(
        autoescape=False,          # notification bodies are plain text / caller-escaped HTML
        undefined=ChainableUndefined,  # {{ a.b }} on a missing key → empty, never KeyError
        trim_blocks=True,
        lstrip_blocks=True,
    )


def render(template_str: str | None, context: dict[str, Any]) -> str:
    """Render a template string against a context. Failures degrade to '' (best-effort)."""
    if not template_str:
        return ""
    try:
        return _env().from_string(template_str).render(**(context or {})).strip()
    except Exception as exc:  # noqa: BLE001 — a bad template must never break delivery
        log.warning("template_render_failed", error=str(exc))
        return ""
