"""i18n router (docs/08 S9).

`GET /i18n/{locale}/{namespace}` is public-to-authed with an ETag; admin CRUD +
CSV import/export under `translations.manage`.
"""

from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.responses import success
from app.core.database import get_session
from app.core.exceptions import ValidationFailed
from app.modules.auth.dependencies import CurrentUser, get_current_user_optional, require
from app.modules.i18n.service import I18nService, bundle_etag

router = APIRouter(tags=["i18n"])
PERM = "translations.manage"


@router.get("/i18n/{locale}/{namespace}", summary="Translation bundle (ETag-cached)",
            response_model=None)
async def get_bundle(
    locale: str,
    namespace: str,
    request: Request,
    response: Response,
    _: CurrentUser | None = Depends(get_current_user_optional),
    session: AsyncSession = Depends(get_session),
) -> dict | Response:
    bundle = await I18nService(session).bundle(locale, namespace)
    etag = f'"{bundle_etag(bundle)}"'
    # A matching If-None-Match short-circuits to 304 — the bundle rarely changes.
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag})
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "private, max-age=600"
    return success(bundle)


class TranslationWrite(BaseModel):
    locale: str = Field(min_length=2, max_length=8)
    namespace: str = Field(min_length=1, max_length=48)
    key: str = Field(min_length=1, max_length=128)
    value: str


@router.get("/admin/locales", summary="List locales")
async def list_locales(
    _: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    rows = await I18nService(session).list_locales()
    return success([{"code": r.code, "name": r.name, "native_name": r.native_name,
                     "is_active": r.is_active, "is_default": r.is_default} for r in rows])


@router.get("/admin/translations", summary="List translations for a locale+namespace")
async def list_translations(
    locale: str,
    namespace: str,
    _: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    rows = await I18nService(session).list_translations(locale, namespace)
    return success([{"key": r.key, "value": r.value} for r in rows])


@router.put("/admin/translations", summary="Upsert a translation")
async def upsert_translation(
    body: TranslationWrite,
    _: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    row = await I18nService(session).upsert(body.locale, body.namespace, body.key, body.value)
    await session.commit()
    return success({"locale": row.locale, "namespace": row.namespace,
                    "key": row.key, "value": row.value})


@router.get("/admin/translation-gaps", summary="Untranslated keys, most-hit first")
async def list_gaps(
    _: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    rows = await I18nService(session).list_gaps()
    return success([{"locale": r.locale, "namespace": r.namespace, "key": r.key,
                     "hits": r.hits, "first_seen_at": r.first_seen_at.isoformat()}
                    for r in rows])


@router.post("/admin/translations/import", summary="Import translations from CSV")
async def import_translations(
    request: Request,
    _: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Accepts a CSV body with header row locale,namespace,key,value."""
    raw = (await request.body()).decode("utf-8-sig")
    try:
        reader = csv.DictReader(io.StringIO(raw))
        rows = list(reader)
    except Exception as exc:  # noqa: BLE001
        raise ValidationFailed(f"Malformed CSV: {exc}", code="I18N_BAD_CSV",
                               http_status=422) from exc
    n = await I18nService(session).import_csv(rows)
    await session.commit()
    return success({"imported": n})


@router.get("/admin/translations/export", summary="Export translations as CSV",
            response_class=PlainTextResponse)
async def export_translations(
    locale: str | None = None,
    _: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> PlainTextResponse:
    rows = await I18nService(session).export_rows(locale)
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=["locale", "namespace", "key", "value"])
    writer.writeheader()
    writer.writerows(rows)
    return PlainTextResponse(buf.getvalue(), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=translations.csv"})
