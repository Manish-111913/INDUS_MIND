"""Compliance HTTP router (docs/02 §14, §15, §19).

Permission gates (docs/01 §22): reads need `comp.read`; regulation/clause/mapping
authoring `comp.map`; gaps + audits + scan `comp.gap.manage`; evidence generation
`comp.evidence.generate`. The share-token download is intentionally
unauthenticated — it is the auditor read-only access path (a capability URL).
Static/sub-path routes are declared before `/{id}` routes so an id path never
shadows them.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import PageParams
from app.common.responses import success
from app.core.database import get_session
from app.modules.auth.dependencies import CurrentUser, require
from app.modules.compliance import events as _events  # noqa: F401 — registers graph subscribers
from app.modules.compliance.evidence import EvidenceService
from app.modules.compliance.mapping_agent import ComplianceScanService
from app.modules.compliance.parse_agent import RegulationImportService
from app.modules.compliance.schemas import (
    AuditCreate,
    AuditRead,
    AuditUpdate,
    ClauseCreate,
    ClauseRead,
    ClauseUpdate,
    ComplianceScan,
    EvidencePackageCreate,
    EvidencePackageRead,
    GapCreate,
    GapRead,
    GapUpdate,
    MappingCreate,
    MappingRead,
    MappingStatusUpdate,
    RegulationCreate,
    RegulationImport,
    RegulationRead,
    RegulationUpdate,
)
from app.modules.compliance.service import (
    AuditService_,
    ClauseService,
    CoverageService,
    GapService,
    MappingService,
    RegulationService,
)

router = APIRouter(tags=["compliance"])


def _page(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
          sort: str | None = Query("-created_at")) -> PageParams:
    return PageParams(page=page, page_size=page_size, sort=sort)


# ── AI scan (docs/02 §15) ─────────────────────────────────────────────────────
@router.post("/ai/compliance/scan", summary="Run the compliance mapping/gap agent")
async def compliance_scan(body: ComplianceScan | None = None,
                          actor: CurrentUser = Depends(require("comp.gap.manage")),
                          session: AsyncSession = Depends(get_session)) -> dict:
    result = await ComplianceScanService(session, actor.tenant_id).scan(
        scope=body.scope if body else {}, actor=actor)
    return success(result)


# ── regulations ───────────────────────────────────────────────────────────────
@router.get("/compliance/regulations", summary="List regulations")
async def list_regulations(params: PageParams = Depends(_page),
                           body: str | None = Query(None),
                           q: str | None = Query(None),
                           actor: CurrentUser = Depends(require("comp.read")),
                           session: AsyncSession = Depends(get_session)) -> dict:
    page = await RegulationService(session, actor.tenant_id).list(params, body=body, q=q)
    return success([RegulationRead.model_validate(r).model_dump() for r in page.items], meta=page.meta)


@router.post("/compliance/regulations", status_code=201, summary="Create a regulation")
async def create_regulation(body: RegulationCreate,
                            actor: CurrentUser = Depends(require("comp.map")),
                            session: AsyncSession = Depends(get_session)) -> dict:
    reg = await RegulationService(session, actor.tenant_id).create(data=body, actor=actor)
    return success(RegulationRead.model_validate(reg).model_dump())


@router.post("/compliance/regulations/import", summary="Import a regulation document → clause tree")
async def import_regulation(body: RegulationImport,
                            actor: CurrentUser = Depends(require("comp.map")),
                            session: AsyncSession = Depends(get_session)) -> dict:
    reg, clauses = await RegulationImportService(session, actor.tenant_id).import_document(
        document_id=body.document_id, actor=actor, code=body.code, title=body.title, body=body.body)
    data = RegulationRead.model_validate(reg).model_dump()
    data["clauses_parsed"] = clauses
    return success(data)


@router.get("/compliance/regulations/{regulation_id}/clauses", summary="Clause tree for a regulation")
async def regulation_clauses(regulation_id: uuid.UUID,
                             actor: CurrentUser = Depends(require("comp.read")),
                             session: AsyncSession = Depends(get_session)) -> dict:
    clauses = await RegulationService(session, actor.tenant_id).clauses_for(regulation_id)
    return success([ClauseRead.model_validate(c).model_dump() for c in clauses])


@router.get("/compliance/regulations/{regulation_id}", summary="Get a regulation")
async def get_regulation(regulation_id: uuid.UUID,
                         actor: CurrentUser = Depends(require("comp.read")),
                         session: AsyncSession = Depends(get_session)) -> dict:
    reg = await RegulationService(session, actor.tenant_id).get(regulation_id)
    return success(RegulationRead.model_validate(reg).model_dump())


@router.patch("/compliance/regulations/{regulation_id}", summary="Update a regulation")
async def update_regulation(regulation_id: uuid.UUID, body: RegulationUpdate,
                            actor: CurrentUser = Depends(require("comp.map")),
                            session: AsyncSession = Depends(get_session)) -> dict:
    reg = await RegulationService(session, actor.tenant_id).update(regulation_id, data=body, actor=actor)
    return success(RegulationRead.model_validate(reg).model_dump())


@router.delete("/compliance/regulations/{regulation_id}", summary="Delete a regulation")
async def delete_regulation(regulation_id: uuid.UUID,
                            actor: CurrentUser = Depends(require("comp.map")),
                            session: AsyncSession = Depends(get_session)) -> dict:
    await RegulationService(session, actor.tenant_id).delete(regulation_id, actor=actor)
    return success({"message": "Regulation deleted"})


# ── clauses ───────────────────────────────────────────────────────────────────
@router.post("/compliance/clauses", status_code=201, summary="Create a clause")
async def create_clause(body: ClauseCreate,
                        actor: CurrentUser = Depends(require("comp.map")),
                        session: AsyncSession = Depends(get_session)) -> dict:
    clause = await ClauseService(session, actor.tenant_id).create(data=body, actor=actor)
    return success(ClauseRead.model_validate(clause).model_dump())


@router.get("/compliance/clauses/{clause_id}", summary="Get a clause")
async def get_clause(clause_id: uuid.UUID,
                     actor: CurrentUser = Depends(require("comp.read")),
                     session: AsyncSession = Depends(get_session)) -> dict:
    clause = await ClauseService(session, actor.tenant_id).get(clause_id)
    return success(ClauseRead.model_validate(clause).model_dump())


@router.patch("/compliance/clauses/{clause_id}", summary="Update a clause")
async def update_clause(clause_id: uuid.UUID, body: ClauseUpdate,
                        actor: CurrentUser = Depends(require("comp.map")),
                        session: AsyncSession = Depends(get_session)) -> dict:
    clause = await ClauseService(session, actor.tenant_id).update(clause_id, data=body, actor=actor)
    return success(ClauseRead.model_validate(clause).model_dump())


@router.delete("/compliance/clauses/{clause_id}", summary="Delete a clause")
async def delete_clause(clause_id: uuid.UUID,
                        actor: CurrentUser = Depends(require("comp.map")),
                        session: AsyncSession = Depends(get_session)) -> dict:
    await ClauseService(session, actor.tenant_id).delete(clause_id, actor=actor)
    return success({"message": "Clause deleted"})


# ── mappings ──────────────────────────────────────────────────────────────────
@router.get("/compliance/mappings", summary="List compliance mappings")
async def list_mappings(params: PageParams = Depends(_page),
                        clause_id: uuid.UUID | None = Query(None),
                        status: str | None = Query(None),
                        actor: CurrentUser = Depends(require("comp.read")),
                        session: AsyncSession = Depends(get_session)) -> dict:
    page = await MappingService(session, actor.tenant_id).list(
        params, clause_id=clause_id, status=status)
    return success([MappingRead.model_validate(m).model_dump() for m in page.items], meta=page.meta)


@router.post("/compliance/mappings", status_code=201, summary="Create a mapping (human)")
async def create_mapping(body: MappingCreate,
                         actor: CurrentUser = Depends(require("comp.map")),
                         session: AsyncSession = Depends(get_session)) -> dict:
    mapping = await MappingService(session, actor.tenant_id).create(data=body, actor=actor)
    return success(MappingRead.model_validate(mapping).model_dump())


@router.patch("/compliance/mappings/{mapping_id}", summary="Confirm/reject a mapping")
async def update_mapping(mapping_id: uuid.UUID, body: MappingStatusUpdate,
                         actor: CurrentUser = Depends(require("comp.map")),
                         session: AsyncSession = Depends(get_session)) -> dict:
    mapping = await MappingService(session, actor.tenant_id).set_status(
        mapping_id, status=body.status, version=body.version, actor=actor)
    return success(MappingRead.model_validate(mapping).model_dump())


# ── coverage (heatmap) ────────────────────────────────────────────────────────
@router.get("/compliance/coverage", summary="Regulation × area coverage matrix")
async def coverage(actor: CurrentUser = Depends(require("comp.read")),
                   session: AsyncSession = Depends(get_session)) -> dict:
    data = await CoverageService(session, actor.tenant_id).compute()
    return success(data)


# ── gaps ──────────────────────────────────────────────────────────────────────
@router.get("/compliance/gaps", summary="List compliance gaps")
async def list_gaps(params: PageParams = Depends(_page),
                    status: str | None = Query(None),
                    severity: str | None = Query(None),
                    clause_id: uuid.UUID | None = Query(None),
                    equipment_id: uuid.UUID | None = Query(None),
                    detected_by: str | None = Query(None),
                    actor: CurrentUser = Depends(require("comp.read")),
                    session: AsyncSession = Depends(get_session)) -> dict:
    page = await GapService(session, actor.tenant_id).list(
        params, status=status, severity=severity, clause_id=clause_id,
        equipment_id=equipment_id, detected_by=detected_by)
    return success([GapRead.model_validate(g).model_dump() for g in page.items], meta=page.meta)


@router.post("/compliance/gaps", status_code=201, summary="Create a gap (manual)")
async def create_gap(body: GapCreate,
                     actor: CurrentUser = Depends(require("comp.gap.manage")),
                     session: AsyncSession = Depends(get_session)) -> dict:
    gap = await GapService(session, actor.tenant_id).create(data=body, actor=actor)
    return success(GapRead.model_validate(gap).model_dump())


@router.get("/compliance/gaps/{gap_id}", summary="Get a gap (side-by-side detail)")
async def get_gap(gap_id: uuid.UUID,
                  actor: CurrentUser = Depends(require("comp.read")),
                  session: AsyncSession = Depends(get_session)) -> dict:
    gap = await GapService(session, actor.tenant_id).get(gap_id)
    return success(GapRead.model_validate(gap).model_dump())


@router.patch("/compliance/gaps/{gap_id}", summary="Update a gap")
async def update_gap(gap_id: uuid.UUID, body: GapUpdate,
                     actor: CurrentUser = Depends(require("comp.gap.manage")),
                     session: AsyncSession = Depends(get_session)) -> dict:
    gap = await GapService(session, actor.tenant_id).update(gap_id, data=body, actor=actor)
    return success(GapRead.model_validate(gap).model_dump())


@router.delete("/compliance/gaps/{gap_id}", summary="Delete a gap")
async def delete_gap(gap_id: uuid.UUID,
                     actor: CurrentUser = Depends(require("comp.gap.manage")),
                     session: AsyncSession = Depends(get_session)) -> dict:
    await GapService(session, actor.tenant_id).delete(gap_id, actor=actor)
    return success({"message": "Gap deleted"})


@router.post("/compliance/gaps/{gap_id}/create-remediation",
             summary="Spawn a remediation work order (source=gap)")
async def create_remediation(gap_id: uuid.UUID,
                             actor: CurrentUser = Depends(require("comp.gap.manage")),
                             session: AsyncSession = Depends(get_session)) -> dict:
    gap, wo_id = await GapService(session, actor.tenant_id).create_remediation(gap_id, actor=actor)
    data = GapRead.model_validate(gap).model_dump()
    data["work_order_id"] = str(wo_id)
    return success(data)


# ── evidence packages ─────────────────────────────────────────────────────────
@router.post("/compliance/evidence-packages", status_code=201, summary="Generate an evidence package")
async def create_evidence_package(body: EvidencePackageCreate,
                                  actor: CurrentUser = Depends(require("comp.evidence.generate")),
                                  session: AsyncSession = Depends(get_session)) -> dict:
    package = await EvidenceService(session, actor.tenant_id).create(
        scope=body.scope, audit_id=body.audit_id, title=body.title, actor=actor)
    return success(EvidencePackageRead.model_validate(package).model_dump())


@router.get("/compliance/evidence-packages", summary="List evidence packages")
async def list_evidence_packages(params: PageParams = Depends(_page),
                                 status: str | None = Query(None),
                                 actor: CurrentUser = Depends(require("comp.read")),
                                 session: AsyncSession = Depends(get_session)) -> dict:
    page = await EvidenceService(session, actor.tenant_id).repo.list(params, status=status)
    return success([EvidencePackageRead.model_validate(p).model_dump() for p in page.items],
                   meta=page.meta)


@router.get("/compliance/evidence-packages/share/{token}",
            summary="Auditor read-only download (share token, no login)")
async def evidence_share_download(token: str,
                                  session: AsyncSession = Depends(get_session)) -> dict:
    # Unauthenticated capability URL — the token IS the credential (docs/02 §19).
    from sqlalchemy import select

    from app.core.exceptions import NotFound
    from app.modules.compliance.models import EvidencePackage

    row = (await session.execute(select(EvidencePackage).where(
        EvidencePackage.share_token == token,
        EvidencePackage.deleted_at.is_(None)))).scalar_one_or_none()
    if row is None:
        raise NotFound("Evidence package not found", code="EVIDENCE_NOT_FOUND")
    url = await EvidenceService(session, row.tenant_id).download_url_by_token(token)
    return success({"download_url": url})


@router.get("/compliance/evidence-packages/{package_id}/download-url",
            summary="Presigned download URL for an evidence package")
async def evidence_download_url(package_id: uuid.UUID,
                                actor: CurrentUser = Depends(require("comp.read")),
                                session: AsyncSession = Depends(get_session)) -> dict:
    url = await EvidenceService(session, actor.tenant_id).download_url(package_id)
    return success({"download_url": url})


@router.get("/compliance/evidence-packages/{package_id}", summary="Get an evidence package")
async def get_evidence_package(package_id: uuid.UUID,
                               actor: CurrentUser = Depends(require("comp.read")),
                               session: AsyncSession = Depends(get_session)) -> dict:
    package = await EvidenceService(session, actor.tenant_id).get(package_id)
    return success(EvidencePackageRead.model_validate(package).model_dump())


# ── audits ────────────────────────────────────────────────────────────────────
@router.get("/compliance/audits", summary="List audits")
async def list_audits(params: PageParams = Depends(_page),
                      status: str | None = Query(None),
                      actor: CurrentUser = Depends(require("comp.read")),
                      session: AsyncSession = Depends(get_session)) -> dict:
    page = await AuditService_(session, actor.tenant_id).list(params, status=status)
    return success([AuditRead.model_validate(a).model_dump() for a in page.items], meta=page.meta)


@router.post("/compliance/audits", status_code=201, summary="Create an audit")
async def create_audit(body: AuditCreate,
                       actor: CurrentUser = Depends(require("comp.gap.manage")),
                       session: AsyncSession = Depends(get_session)) -> dict:
    audit = await AuditService_(session, actor.tenant_id).create(data=body, actor=actor)
    return success(AuditRead.model_validate(audit).model_dump())


@router.get("/compliance/audits/{audit_id}", summary="Get an audit")
async def get_audit(audit_id: uuid.UUID,
                    actor: CurrentUser = Depends(require("comp.read")),
                    session: AsyncSession = Depends(get_session)) -> dict:
    audit = await AuditService_(session, actor.tenant_id).get(audit_id)
    return success(AuditRead.model_validate(audit).model_dump())


@router.patch("/compliance/audits/{audit_id}", summary="Update an audit")
async def update_audit(audit_id: uuid.UUID, body: AuditUpdate,
                       actor: CurrentUser = Depends(require("comp.gap.manage")),
                       session: AsyncSession = Depends(get_session)) -> dict:
    audit = await AuditService_(session, actor.tenant_id).update(audit_id, data=body, actor=actor)
    return success(AuditRead.model_validate(audit).model_dump())


@router.delete("/compliance/audits/{audit_id}", summary="Delete an audit")
async def delete_audit(audit_id: uuid.UUID,
                       actor: CurrentUser = Depends(require("comp.gap.manage")),
                       session: AsyncSession = Depends(get_session)) -> dict:
    await AuditService_(session, actor.tenant_id).delete(audit_id, actor=actor)
    return success({"message": "Audit deleted"})
