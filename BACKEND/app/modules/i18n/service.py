"""i18n bundle resolution + gap logging + admin CRUD (docs/08 S9)."""

from __future__ import annotations

import hashlib
import json

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.core.redis import get_redis
from app.modules.i18n.models import Locale, Translation, TranslationGap

log = get_logger("i18n")

DEFAULT_LOCALE = "en"
_CACHE_TTL = 600  # 10 min (docs/08 S9)
NAMESPACES = ("common", "nav", "auth", "copilot", "maintenance", "compliance", "admin", "errors")


def _cache_key(locale: str, namespace: str) -> str:
    return f"i18n:{locale}:{namespace}"


def bundle_etag(bundle: dict) -> str:
    """Content hash so an unchanged bundle is a cheap 304."""
    raw = json.dumps(bundle, sort_keys=True, ensure_ascii=False).encode()
    return hashlib.sha256(raw).hexdigest()[:16]


class I18nService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def bundle(self, locale: str, namespace: str) -> dict[str, str]:
        """Merged `{key: value}` for (locale, namespace), en-fallback filled in.

        Requested-locale values win; any key present in `en` but missing in the
        requested locale is backfilled from `en` and logged as a gap. Cached in
        Redis for 10 min, busted on any write.
        """
        redis = get_redis()
        key = _cache_key(locale, namespace)
        try:
            cached = await redis.get(key)
            if cached is not None:
                return json.loads(cached)
        except Exception as exc:  # noqa: BLE001 — cache is optional
            log.warning("i18n_cache_read_failed", error=str(exc))

        en = await self._rows(DEFAULT_LOCALE, namespace)
        target = en if locale == DEFAULT_LOCALE else await self._rows(locale, namespace)
        merged = dict(en)
        merged.update(target)  # requested locale overrides en where present

        if locale != DEFAULT_LOCALE:
            missing = [k for k in en if k not in target]
            if missing:
                await self._log_gaps(locale, namespace, missing)

        try:
            await redis.set(key, json.dumps(merged, ensure_ascii=False), ex=_CACHE_TTL)
        except Exception as exc:  # noqa: BLE001
            log.warning("i18n_cache_write_failed", error=str(exc))
        return merged

    async def _rows(self, locale: str, namespace: str) -> dict[str, str]:
        stmt = select(Translation.key, Translation.value).where(
            Translation.locale == locale, Translation.namespace == namespace)
        return dict((await self.session.execute(stmt)).all())

    async def _log_gaps(self, locale: str, namespace: str, keys: list[str]) -> None:
        """Fire-and-forget upsert bumping `hits` for each missing key."""
        try:
            for k in keys:
                stmt = pg_insert(TranslationGap).values(
                    locale=locale, namespace=namespace, key=k, hits=1)
                stmt = stmt.on_conflict_do_update(
                    constraint="uq_translation_gaps_locale_ns_key",
                    set_={"hits": TranslationGap.hits + 1})
                await self.session.execute(stmt)
            await self.session.commit()
        except Exception as exc:  # noqa: BLE001 — a missing translation must still serve
            log.warning("i18n_gap_log_failed", error=str(exc))
            await self.session.rollback()

    # ── admin ────────────────────────────────────────────────────────────────
    async def list_locales(self) -> list[Locale]:
        return list((await self.session.execute(
            select(Locale).order_by(Locale.code))).scalars().all())

    async def list_translations(self, locale: str, namespace: str) -> list[Translation]:
        stmt = (select(Translation)
                .where(Translation.locale == locale, Translation.namespace == namespace)
                .order_by(Translation.key))
        return list((await self.session.execute(stmt)).scalars().all())

    async def upsert(self, locale: str, namespace: str, key: str, value: str) -> Translation:
        stmt = pg_insert(Translation).values(
            locale=locale, namespace=namespace, key=key, value=value)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_translations_locale_ns_key", set_={"value": value})
        await self.session.execute(stmt)
        # A filled key is no longer a gap.
        await self.session.execute(
            TranslationGap.__table__.delete().where(
                (TranslationGap.locale == locale) & (TranslationGap.namespace == namespace)
                & (TranslationGap.key == key)))
        await self._bust(locale, namespace)
        await self.session.flush()
        return (await self.session.execute(
            select(Translation).where(Translation.locale == locale,
                                      Translation.namespace == namespace,
                                      Translation.key == key))).scalar_one()

    async def list_gaps(self) -> list[TranslationGap]:
        return list((await self.session.execute(
            select(TranslationGap).order_by(TranslationGap.hits.desc()))).scalars().all())

    async def import_csv(self, rows: list[dict]) -> int:
        """rows: [{locale, namespace, key, value}]. Upserts each; returns count."""
        n = 0
        touched: set[tuple[str, str]] = set()
        for r in rows:
            loc, ns, key, val = r.get("locale"), r.get("namespace"), r.get("key"), r.get("value")
            if not (loc and ns and key):
                continue
            stmt = pg_insert(Translation).values(locale=loc, namespace=ns, key=key, value=val or "")
            stmt = stmt.on_conflict_do_update(
                constraint="uq_translations_locale_ns_key", set_={"value": val or ""})
            await self.session.execute(stmt)
            touched.add((loc, ns))
            n += 1
        for loc, ns in touched:
            await self._bust(loc, ns)
        await self.session.flush()
        return n

    async def export_rows(self, locale: str | None = None) -> list[dict]:
        stmt = select(Translation)
        if locale:
            stmt = stmt.where(Translation.locale == locale)
        stmt = stmt.order_by(Translation.locale, Translation.namespace, Translation.key)
        return [{"locale": t.locale, "namespace": t.namespace, "key": t.key, "value": t.value}
                for t in (await self.session.execute(stmt)).scalars().all()]

    async def _bust(self, locale: str, namespace: str) -> None:
        try:
            await get_redis().delete(_cache_key(locale, namespace))
        except Exception as exc:  # noqa: BLE001
            log.warning("i18n_cache_bust_failed", error=str(exc))


async def resolve_label(session: AsyncSession, label: str, label_i18n: dict | None,
                        locale: str) -> str:
    """Resolve a lookup's label for a caller locale (docs/08 S9).

    `label_i18n` is `{"hi": "…"}`; falls back to the base `label` for `en` or any
    untranslated locale. Pure function of its inputs — no query — so lookup lists
    stay a single round-trip.
    """
    if locale and locale != DEFAULT_LOCALE and label_i18n:
        return label_i18n.get(locale) or label
    return label
