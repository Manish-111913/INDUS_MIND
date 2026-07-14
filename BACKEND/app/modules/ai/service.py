"""Prompt rendering service (docs/02 §38, §39 — prompt-injection hardening).

Renders `prompt_templates` via safe substitution with a variable whitelist — only
variables declared on the template are interpolated; unknown supplied keys are
rejected. No eval / format-string injection.

Prompt-injection defence (docs/02 §39: "retrieved document text is data"):
retrieved chunks, uploaded document text and other untrusted content are wrapped
in the templates between the ``FENCE_START`` / ``FENCE_END`` sentinels, and every
template carries an explicit rule telling the model to treat everything between
the fences as data and never obey instructions found inside it. To stop a
malicious document from *forging* a fence boundary and escaping the data region,
``render()`` strips the sentinel tokens out of every interpolated value before
substitution — so the only fences the model ever sees are the ones the template
author placed. Use ``fence(label, text)`` when assembling untrusted content into
a prompt outside the template system.
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFound, ValidationFailed
from app.modules.ai.repository import PromptRepository

# Sentinels that delimit an untrusted-data region inside a prompt. Chosen to be
# visually distinct and vanishingly unlikely to occur in real content; any that
# *do* appear in a value are stripped by ``_sanitize`` so they cannot be forged.
FENCE_START = "⟦UNTRUSTED-DATA⟧"
FENCE_END = "⟦/UNTRUSTED-DATA⟧"


def _sanitize(value: str) -> str:
    """Remove fence sentinels from an interpolated value (anti-fence-forgery)."""
    return value.replace(FENCE_START, "").replace(FENCE_END, "")


def fence(label: str, text: str) -> str:
    """Wrap untrusted ``text`` in a labelled data region for prompt inclusion."""
    return f"{FENCE_START} {label}\n{_sanitize(str(text))}\n{FENCE_END}"


class PromptService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = PromptRepository(session)

    async def render(self, tenant_id: uuid.UUID | str | None, key: str,
                     variables: dict[str, str]) -> str:
        template = await self.repo.active(tenant_id, key)
        if template is None:
            raise NotFound(f"Prompt template '{key}' not found", code="PROMPT_NOT_FOUND")
        whitelist = set(template.variables or [])
        unknown = set(variables) - whitelist
        if unknown:
            raise ValidationFailed(f"Unknown prompt variables: {sorted(unknown)}",
                                   code="PROMPT_VARIABLE_UNKNOWN", http_status=422)
        rendered = template.template
        for name in whitelist:
            # Sanitize values so untrusted content cannot forge a fence boundary.
            rendered = rendered.replace("{{" + name + "}}", _sanitize(str(variables.get(name, ""))))
        return rendered
