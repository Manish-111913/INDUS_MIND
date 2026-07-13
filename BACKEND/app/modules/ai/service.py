"""Prompt rendering service (docs/02 §38).

Renders `prompt_templates` via safe substitution with a variable whitelist — only
variables declared on the template are interpolated; unknown supplied keys are
rejected. No eval / format-string injection.
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFound, ValidationFailed
from app.modules.ai.repository import PromptRepository


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
            rendered = rendered.replace("{{" + name + "}}", str(variables.get(name, "")))
        return rendered
