"""Content-pages router (docs/08 N5).

`GET /content/{slug}` serves public pages anonymously (privacy/terms for the
landing page) and non-public pages to any authed user. Admin CRUD under
`content.manage`.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.responses import success
from app.core.database import get_session
from app.core.exceptions import NotFound
from app.modules.auth.dependencies import CurrentUser, get_current_user, require
from app.modules.content.models import ContentPage

router = APIRouter(tags=["content"])
PERM = "content.manage"


async def _resolve(session: AsyncSession, slug: str, tenant_id) -> ContentPage | None:
    """Tenant override wins over the system page of the same slug."""
    stmt = select(ContentPage).where(
        ContentPage.slug == slug,
        or_(ContentPage.tenant_id == tenant_id, ContentPage.tenant_id.is_(None)),
    ).order_by(ContentPage.tenant_id.desc().nulls_last())
    return (await session.execute(stmt)).scalars().first()


@router.get("/content/{slug}", summary="Get a content page (public if marked so)")
async def get_content(
    slug: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Public pages (privacy/terms) serve anonymously; anything else requires a
    logged-in caller (401 if absent) and resolves within their tenant."""
    public = (await session.execute(
        select(ContentPage).where(ContentPage.slug == slug,
                                  ContentPage.tenant_id.is_(None),
                                  ContentPage.is_public.is_(True)))).scalars().first()
    if public is not None:
        return success(_read(public))

    current = await get_current_user(request, session)
    page = await _resolve(session, slug, current.tenant_id)
    if page is None:
        raise NotFound("Content page not found", code="CONTENT_NOT_FOUND")
    return success(_read(page))


def _read(page: ContentPage) -> dict:
    return {"slug": page.slug, "title": page.title, "body_md": page.body_md,
            "is_public": page.is_public, "updated_at": page.updated_at.isoformat()}


class ContentWrite(BaseModel):
    slug: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=256)
    body_md: str = Field(min_length=1)
    is_public: bool = False


@router.get("/admin/content", summary="List content pages")
async def list_content(
    actor: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    rows = (await session.execute(
        select(ContentPage).where(
            or_(ContentPage.tenant_id == actor.tenant_id, ContentPage.tenant_id.is_(None)))
        .order_by(ContentPage.slug))).scalars().all()
    return success([_read(r) for r in rows])


@router.put("/admin/content/{slug}", summary="Create or update a content page")
async def upsert_content(
    slug: str,
    body: ContentWrite,
    actor: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> dict:
    existing = (await session.execute(
        select(ContentPage).where(ContentPage.slug == slug,
                                  ContentPage.tenant_id == actor.tenant_id))).scalars().first()
    if existing is None:
        existing = ContentPage(tenant_id=actor.tenant_id, slug=slug, created_by=actor.id)
        session.add(existing)
    existing.title = body.title
    existing.body_md = body.body_md
    existing.is_public = body.is_public
    existing.updated_by = actor.id
    await session.commit()
    await session.refresh(existing)
    return success(_read(existing))


@router.delete("/admin/content/{page_id}", status_code=204, summary="Delete a content page")
async def delete_content(
    page_id: uuid.UUID,
    actor: CurrentUser = Depends(require(PERM)),
    session: AsyncSession = Depends(get_session),
) -> None:
    row = (await session.execute(
        select(ContentPage).where(ContentPage.id == page_id,
                                  ContentPage.tenant_id == actor.tenant_id))).scalars().first()
    if row is None:
        raise NotFound("Content page not found", code="CONTENT_NOT_FOUND")
    await session.delete(row)
    await session.commit()
