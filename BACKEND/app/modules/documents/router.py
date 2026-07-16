"""Documents HTTP router (docs/02 §17).

Reads → doc.read, uploads/versions → doc.create, reprocess → doc.reprocess,
delete → doc.delete. All logic lives in the service.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams
from app.common.responses import success
from app.core.database import get_session
from app.core.exceptions import NotFound
from app.modules.auth.dependencies import CurrentUser, require
from app.modules.documents.schemas import (
    ConfirmRequest,
    DocumentDetail,
    DocumentRead,
    JobStagesRead,
    MessageResponse,
    ReprocessRequest,
    UploadUrlRequest,
    UploadUrlResponse,
    UrlResponse,
    VersionCreateRequest,
    VersionCreateResponse,
    VersionRead,
)
from app.modules.documents.service import DocumentService

router = APIRouter(prefix="/documents", tags=["documents"])


def _page(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
          sort: str | None = Query("-created_at")) -> PageParams:
    return PageParams(page=page, page_size=page_size, sort=sort)


# ── upload flow ──────────────────────────────────────────────────────────────
@router.post("/upload-url", status_code=201, summary="Get a presigned PUT to upload a document")
async def upload_url(body: UploadUrlRequest,
                     actor: CurrentUser = Depends(require("doc.create")),
                     session: AsyncSession = Depends(get_session)) -> dict:
    result = await DocumentService(session, actor.tenant_id).create_upload_url(
        filename=body.filename, mime=body.mime, size=body.size, title=body.title, actor=actor)
    return success(UploadUrlResponse(**result).model_dump())


@router.post("/{document_id}/confirm", summary="Confirm upload → triggers ingestion")
async def confirm(document_id: uuid.UUID, body: ConfirmRequest,
                  actor: CurrentUser = Depends(require("doc.create")),
                  session: AsyncSession = Depends(get_session)) -> dict:
    document = await DocumentService(session, actor.tenant_id).confirm(
        document_id, checksum=body.checksum, meta=body.meta, actor=actor)
    return success(DocumentRead.model_validate(document).model_dump())


# ── list / detail ────────────────────────────────────────────────────────────
@router.get("", summary="List documents (filters + pagination)")
async def list_documents(
    params: PageParams = Depends(_page),
    type: uuid.UUID | None = Query(None, description="doc_type_id"),
    status: str | None = Query(None, description="ingestion_status"),
    equipment_id: uuid.UUID | None = Query(None),
    tag: str | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    q: str | None = Query(None),
    actor: CurrentUser = Depends(require("doc.read")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    page = await DocumentService(session, actor.tenant_id).list(
        params, doc_type_id=type, ingestion_status=status, equipment_id=equipment_id,
        tag=tag, date_from=date_from, date_to=date_to, q=q)
    return success([DocumentRead.model_validate(d).model_dump() for d in page.items], meta=page.meta)


@router.get("/{document_id}", summary="Document metadata + ingestion job stages")
async def get_document(document_id: str,
                       actor: CurrentUser = Depends(require("doc.read")),
                       session: AsyncSession = Depends(get_session)) -> dict:
    # Accept the id as a raw string so a malformed/stale id (e.g. a stray "doc-1"
    # from a bookmarked link) resolves to a clean 404 "not found" rather than a
    # 422 validation fault that the UI renders as a scary "System Fault".
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise NotFound("Document not found", code="DOC_NOT_FOUND")
    document, job = await DocumentService(session, actor.tenant_id).get_detail(doc_uuid)
    detail = DocumentDetail.model_validate(document)
    detail.job = JobStagesRead.model_validate(job) if job else None
    return success(detail.model_dump())


@router.get("/{document_id}/download-url", summary="Presigned GET for the current version")
async def download_url(document_id: uuid.UUID,
                       actor: CurrentUser = Depends(require("doc.read")),
                       session: AsyncSession = Depends(get_session)) -> dict:
    url = await DocumentService(session, actor.tenant_id).download_url(document_id)
    return success(UrlResponse(url=url).model_dump())


@router.get("/{document_id}/pages/{page}/thumbnail", summary="Page thumbnail (pipeline-generated)")
async def thumbnail(document_id: uuid.UUID, page: int,
                    actor: CurrentUser = Depends(require("doc.read")),
                    session: AsyncSession = Depends(get_session)) -> dict:
    url = await DocumentService(session, actor.tenant_id).thumbnail_url(document_id, page)
    return success(UrlResponse(url=url).model_dump())


# ── versions ─────────────────────────────────────────────────────────────────
@router.get("/{document_id}/versions", summary="List document versions")
async def list_versions(document_id: uuid.UUID,
                        actor: CurrentUser = Depends(require("doc.read")),
                        session: AsyncSession = Depends(get_session)) -> dict:
    versions = await DocumentService(session, actor.tenant_id).list_versions(document_id)
    return success([VersionRead.model_validate(v).model_dump() for v in versions])


@router.post("/{document_id}/versions", status_code=201, summary="Create a new version (presigned PUT)")
async def create_version(document_id: uuid.UUID, body: VersionCreateRequest,
                         actor: CurrentUser = Depends(require("doc.create")),
                         session: AsyncSession = Depends(get_session)) -> dict:
    result = await DocumentService(session, actor.tenant_id).create_version(
        document_id, filename=body.filename, mime=body.mime, size=body.size,
        notes=body.notes, actor=actor)
    return success(VersionCreateResponse(**result).model_dump())


# ── reprocess / delete ───────────────────────────────────────────────────────
@router.post("/{document_id}/reprocess", summary="Re-run the ingestion pipeline")
async def reprocess(document_id: uuid.UUID, body: ReprocessRequest | None = None,
                    actor: CurrentUser = Depends(require("doc.reprocess")),
                    session: AsyncSession = Depends(get_session)) -> dict:
    from_stage = body.from_stage if body else None
    job = await DocumentService(session, actor.tenant_id).reprocess(
        document_id, from_stage=from_stage, actor=actor)
    return success(JobStagesRead.model_validate(job).model_dump())


@router.delete("/{document_id}", summary="Soft-delete a document (original retained)")
async def delete_document(document_id: uuid.UUID,
                          actor: CurrentUser = Depends(require("doc.delete")),
                          session: AsyncSession = Depends(get_session)) -> dict:
    await DocumentService(session, actor.tenant_id).delete(document_id, actor=actor)
    return success(MessageResponse(message="Document deleted").model_dump())
