"""Dashboard service (docs/02 §21, §31).

`config()` resolves the user's role-default layout and merges their personal
override (per widget_key). `widgets()` returns the registry filtered by the
caller's permissions. `widget_data()` dispatches to the real provider in
`widgets.py`, wrapped in a Redis cache (30–60 s per widget config).
"""

from __future__ import annotations

import hashlib
import json
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFound, PermissionDenied
from app.core.logging import get_logger
from app.core.redis import get_redis
from app.modules.dashboards.models import DashboardConfig
from app.modules.dashboards.repository import DashboardConfigRepository, WidgetRepository
from app.modules.dashboards.widgets import WIDGET_DATA
from app.modules.users.models import Role

log = get_logger("dashboards.service")

_DEFAULT_TTL = 45  # seconds (docs/02 §31: 30–60 s per widget)


class DashboardService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.widgets_repo = WidgetRepository(session)
        self.configs = DashboardConfigRepository(session, tenant_id)

    async def config(self, actor) -> dict:
        role_ids = await self._role_ids(actor.roles)
        role_layout: list = []
        role_id_used = None
        for rid in role_ids:
            cfg = await self.configs.for_role(rid)
            if cfg is not None:
                role_layout = cfg.layout
                role_id_used = rid
                break
        personal = await self.configs.for_user(actor.id)
        merged = _merge_layout(role_layout, personal.layout if personal else [])
        # Drop widgets the user can't see (permission-filtered).
        allowed = {w.key for w in await self._visible_widgets(actor.perms)}
        merged = [item for item in merged if item.get("widget_key") in allowed]
        return {"role_id": str(role_id_used) if role_id_used else None,
                "has_personal_override": personal is not None, "layout": merged}

    async def save_config(self, actor, *, layout: list) -> dict:
        personal = await self.configs.for_user(actor.id)
        if personal is None:
            personal = await self.configs.add(DashboardConfig(
                role_id=None, user_id=actor.id, layout=layout,
                created_by=actor.id, updated_by=actor.id))
        else:
            personal.layout = layout
            personal.version += 1
            personal.updated_by = actor.id
            await self.session.flush()
        return await self.config(actor)

    async def widgets(self, actor) -> list[dict]:
        return [{"key": w.key, "name": w.name, "type": w.type, "data_endpoint": w.data_endpoint,
                 "default_params": w.default_params, "required_permission": w.required_permission,
                 "description": w.description} for w in await self._visible_widgets(actor.perms)]

    async def widget_data(self, key: str, actor, params: dict) -> dict:
        widget = await self.widgets_repo.get(key)
        if widget is None or key not in WIDGET_DATA:
            raise NotFound("Widget not found", code="WIDGET_NOT_FOUND")
        if widget.required_permission and widget.required_permission not in actor.perms:
            raise PermissionDenied(f"Missing permission: {widget.required_permission}")
        effective = {**(widget.default_params or {}), **(params or {})}

        cache_key = self._cache_key(key, actor.id, effective)
        ttl = int((widget.config or {}).get("cache_ttl", _DEFAULT_TTL))
        cached = await self._cache_get(cache_key)
        if cached is not None:
            cached["cached"] = True
            return cached

        data = await WIDGET_DATA[key](self.session, self.tenant_id, actor.id, effective)
        payload = {"widget_key": key, "type": widget.type, "params": effective, "data": data,
                   "cached": False}
        await self._cache_set(cache_key, payload, ttl)
        return payload

    # ── helpers ───────────────────────────────────────────────────────────────
    async def _role_ids(self, role_names: list[str]) -> list[uuid.UUID]:
        if not role_names:
            return []
        rows = (await self.session.execute(select(Role).where(
            Role.tenant_id == self.tenant_id, Role.name.in_(role_names),
            Role.deleted_at.is_(None)))).scalars().all()
        return [r.id for r in rows]

    async def _visible_widgets(self, perms) -> list:
        return [w for w in await self.widgets_repo.all()
                if not w.required_permission or w.required_permission in perms]

    def _cache_key(self, key: str, user_id, params: dict) -> str:
        digest = hashlib.sha1(  # noqa: S324 — cache key, not security
            json.dumps(params, sort_keys=True, default=str).encode()).hexdigest()[:12]
        return f"tenant:{self.tenant_id}:widget:{key}:{user_id}:{digest}"

    async def _cache_get(self, cache_key: str) -> dict | None:
        try:
            raw = await get_redis().get(cache_key)
            return json.loads(raw) if raw else None
        except Exception as exc:  # noqa: BLE001 — cache is loss-tolerant
            log.warning("widget_cache_get_failed", error=str(exc))
            return None

    async def _cache_set(self, cache_key: str, payload: dict, ttl: int) -> None:
        try:
            await get_redis().set(cache_key, json.dumps(payload, default=str), ex=ttl)
        except Exception as exc:  # noqa: BLE001
            log.warning("widget_cache_set_failed", error=str(exc))


def _merge_layout(role_layout: list, personal_layout: list) -> list:
    """Personal override wins per widget_key; personal-only widgets are appended."""
    if not personal_layout:
        return list(role_layout)
    by_key = {item.get("widget_key"): dict(item) for item in role_layout}
    order = [item.get("widget_key") for item in role_layout]
    for item in personal_layout:
        key = item.get("widget_key")
        if key in by_key:
            by_key[key].update(item)
        else:
            by_key[key] = dict(item)
            order.append(key)
    # Personal layout may also reorder: prefer its order when it lists everything.
    if {i.get("widget_key") for i in personal_layout} >= set(order):
        order = [i.get("widget_key") for i in personal_layout]
    return [by_key[k] for k in order if k in by_key]
