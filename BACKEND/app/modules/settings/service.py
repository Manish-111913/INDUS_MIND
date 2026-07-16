"""Settings resolution service (docs/05 S1).

`effective(user_id, plant_id)` merges system default → tenant → plant → user
(user wins) into a flat `{key: value}` map, cached in Redis for 5 minutes per
(user, plant) and busted on any write for the tenant. Admin get/put operate on a
single scope; writes validate the value against the definition's value_type /
enum_options so a bad value never lands in the DB.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFound, ValidationFailed
from app.core.redis import get_redis
from app.modules.audit.service import AuditService
from app.modules.settings.models import SettingValue
from app.modules.settings.repository import SettingsRepository

_CACHE_TTL = 300  # 5 minutes (docs/05 S1)


def _effective_key(tenant_id, user_id, plant_id) -> str:
    return f"tenant:{tenant_id}:settings:effective:{user_id}:{plant_id or '-'}"


def _bust_pattern(tenant_id) -> str:
    return f"tenant:{tenant_id}:settings:effective:*"


class SettingsService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = SettingsRepository(session, tenant_id)
        self.audit = AuditService(session)

    # ── resolution ───────────────────────────────────────────────────────────
    async def effective(self, user_id: uuid.UUID | str | None,
                        plant_id: uuid.UUID | str | None = None) -> dict[str, Any]:
        cache_key = _effective_key(self.tenant_id, user_id, plant_id)
        redis = get_redis()
        cached = await redis.get(cache_key)
        if cached is not None:
            try:
                return json.loads(cached)
            except (ValueError, TypeError):
                pass

        definitions = await self.repo.definitions()
        by_id = {d.id: d for d in definitions}
        merged: dict[str, Any] = {d.key: d.default_value for d in definitions}

        # Lowest → highest precedence: tenant, then plant, then user.
        for scope, scope_id in (("tenant", self.tenant_id), ("plant", plant_id), ("user", user_id)):
            if scope_id is None:
                continue
            for val in await self.repo.values_for(scope, scope_id):
                definition = by_id.get(val.definition_id)
                if definition is not None:
                    merged[definition.key] = val.value

        await redis.set(cache_key, json.dumps(merged, default=str), ex=_CACHE_TTL)
        return merged

    # ── admin read/write ─────────────────────────────────────────────────────
    async def list_definitions(self) -> list:
        return await self.repo.definitions()

    async def values_at_scope(self, scope: str, scope_id: uuid.UUID | str | None) -> dict[str, Any]:
        """Definition defaults overlaid with the overrides set at exactly this scope."""
        definitions = await self.repo.definitions()
        result = {d.key: d.default_value for d in definitions}
        by_id = {d.id: d for d in definitions}
        for val in await self.repo.values_for(scope, scope_id):
            definition = by_id.get(val.definition_id)
            if definition is not None:
                result[definition.key] = val.value
        return result

    async def set_value(self, *, key: str, scope: str, scope_id: uuid.UUID | str | None,
                        value: Any, actor) -> SettingValue:
        definition = await self.repo.definition_by_key(key)
        if definition is None:
            raise NotFound("Unknown setting", code="SETTING_NOT_FOUND")
        # tenant scope defaults its scope_id to the caller's tenant.
        if scope == "tenant" and scope_id is None:
            scope_id = self.tenant_id
        if scope in ("plant", "user") and scope_id is None:
            raise ValidationFailed(f"scope_id is required for scope '{scope}'",
                                  code="SCOPE_ID_REQUIRED")
        value = _coerce(definition, value)

        existing = await self.repo.get_value(definition.id, scope, scope_id)
        if existing is not None:
            existing.value = value
            existing.updated_by = actor.id
            await self.session.flush()
            row = existing
        else:
            row = await self.repo.add(SettingValue(
                definition_id=definition.id, scope=scope, scope_id=scope_id, value=value,
                created_by=actor.id, updated_by=actor.id))
        await self._bust()
        await self.audit.write(action="setting.set", entity_type="setting", entity_id=row.id,
                               tenant_id=self.tenant_id, actor_id=actor.id,
                               after={"key": key, "scope": scope, "value": value})
        return row

    async def _bust(self) -> None:
        redis = get_redis()
        keys = await redis.keys(_bust_pattern(self.tenant_id))
        if keys:
            await redis.delete(*keys)


def _coerce(definition, value: Any) -> Any:
    """Validate + normalise a value against its definition's type."""
    vt = definition.value_type
    if value is None:
        return None
    try:
        if vt == "int":
            return int(value)
        if vt == "bool":
            if isinstance(value, bool):
                return value
            if isinstance(value, str):
                return value.strip().lower() in ("true", "1", "yes", "on")
            return bool(value)
        if vt == "enum":
            options = definition.enum_options or []
            if value not in options:
                raise ValidationFailed(
                    f"'{value}' is not one of {options}", code="SETTING_ENUM_INVALID")
            return value
        if vt == "string":
            return str(value)
        # json → passthrough (any JSON-serialisable value)
        return value
    except ValidationFailed:
        raise
    except (ValueError, TypeError) as exc:
        raise ValidationFailed(f"Invalid value for {vt} setting: {exc}",
                              code="SETTING_VALUE_INVALID") from exc
