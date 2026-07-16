"""Evidence-package generation (docs/02 §12, §19).

`POST /compliance/evidence-packages {scope}` creates a package (status
generating) and runs the Celery job body `generate`: collect the mapped clauses
+ citations + source documents + inspection/WO records in scope → render a PDF
summary (reportlab: coverage table + per-clause evidence list with document
titles/pages/dates) → ZIP the summary with the cited source files → store to S3
under `tenant/{tid}/evidence/{pkg_id}.zip` → mark ready, mint an auditor
read-only share token, publish a notification + WS progress. `download-url`
presigns a short-lived GET; the share-token endpoint gives auditors read-only
access without a login.
"""

from __future__ import annotations

import io
import secrets
import uuid
import zipfile
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.exceptions import NotFound
from app.core.logging import get_logger
from app.modules.audit.service import AuditService
from app.modules.compliance.models import EvidencePackage
from app.modules.compliance.repository import (
    ClauseRepository,
    EvidenceRepository,
    GapRepository,
    MappingRepository,
    RegulationRepository,
)
from app.modules.documents.models import Document
from app.ws import progress

log = get_logger("compliance.evidence")


class EvidenceService:
    def __init__(self, session: AsyncSession, tenant_id: uuid.UUID | str) -> None:
        self.session = session
        self.tenant_id = tenant_id
        self.repo = EvidenceRepository(session, tenant_id)
        self.regulations = RegulationRepository(session, tenant_id)
        self.clauses = ClauseRepository(session, tenant_id)
        self.mappings = MappingRepository(session, tenant_id)
        self.gaps = GapRepository(session, tenant_id)
        self.audit = AuditService(session)

    async def create(self, *, scope: dict, audit_id: uuid.UUID | None,
                     title: str | None, actor) -> EvidencePackage:
        package = await self.repo.add(EvidencePackage(
            audit_id=audit_id, title=title or "Compliance evidence package", scope=scope,
            status="generating", generated_by=actor.id if actor else None,
            created_by=actor.id if actor else None, updated_by=actor.id if actor else None))
        await self.audit.write(action="compliance.evidence_create", entity_type="evidence_package",
                               entity_id=package.id, tenant_id=self.tenant_id,
                               actor_id=actor.id if actor else None, after={"scope": scope})
        # Hand off to the Celery job (docs/02 §19). The commit that ends the request makes the
        # `generating` row visible; the worker renders the PDF/ZIP and flips it to ready.
        await self.session.flush()
        _enqueue(self.tenant_id, package.id)
        return package

    async def generate(self, package_id: uuid.UUID) -> EvidencePackage:
        """Celery job body (also called directly in tests): render + store the package."""
        package = await self.get(package_id)
        await self._generate(package)
        return package

    async def get(self, package_id: uuid.UUID) -> EvidencePackage:
        package = await self.repo.get(package_id)
        if package is None:
            raise NotFound("Evidence package not found", code="EVIDENCE_NOT_FOUND")
        return package

    async def download_url(self, package_id: uuid.UUID) -> str:
        package = await self.get(package_id)
        return self._presign(package)

    async def download_url_by_token(self, token: str) -> str:
        package = await self.repo.get_by_token(token)
        if package is None:
            raise NotFound("Evidence package not found", code="EVIDENCE_NOT_FOUND")
        return self._presign(package)

    def _presign(self, package: EvidencePackage) -> str:
        from app.core.exceptions import ValidationFailed

        if package.status != "ready" or not package.storage_key:
            raise ValidationFailed("Evidence package is not ready", code="EVIDENCE_NOT_READY",
                                   http_status=422)
        return storage.presigned_get(package.storage_key)

    # ── generation (Celery job body) ──────────────────────────────────────────
    async def _generate(self, package: EvidencePackage) -> None:
        try:
            await self._progress(package.id, "collect", 20)
            data = await self._collect(package.scope)
            await self._progress(package.id, "render", 55)
            pdf_bytes = _render_pdf(data)
            zip_bytes, manifest = await self._build_zip(pdf_bytes, data)

            await self._progress(package.id, "store", 85)
            key = storage.evidence_key(str(self.tenant_id), str(package.id))
            await _to_thread(storage.put_object, key, zip_bytes, "application/zip")

            package.storage_key = key
            package.status = "ready"
            package.share_token = secrets.token_urlsafe(24)
            package.summary = {"coverage": data["coverage"], "manifest": manifest,
                               "generated_at": datetime.now(UTC).isoformat()}
            package.version += 1
            await self.session.flush()
            await self.audit.write(action="compliance.evidence_ready", entity_type="evidence_package",
                                   entity_id=package.id, tenant_id=self.tenant_id,
                                   after={"storage_key": key, "clauses": len(data["clauses"])})
            await self._progress(package.id, "ready", 100)
            from app.core.events import Event, EventType, bus

            await bus.publish(Event(EventType.NOTIFICATION_CREATED, tenant_id=str(self.tenant_id),
                                    payload={"category": "compliance",
                                             "title": "Evidence package ready",
                                             "entity_type": "evidence_package",
                                             "entity_id": str(package.id), "priority": "medium"}))
        except Exception as exc:  # noqa: BLE001 — surface failure on the record, don't crash the request
            log.warning("evidence_generation_failed", package_id=str(package.id), error=str(exc))
            package.status = "failed"
            package.error = str(exc)[:1000]
            package.version += 1
            await self.session.flush()

    async def _collect(self, scope: dict) -> dict:
        """Coverage table + per-clause evidence (mapped procedures/records + gaps)."""
        regulation_id = scope.get("regulation_id")
        regulations = await self.regulations.list_all()
        if regulation_id:
            regulations = [r for r in regulations if str(r.id) == str(regulation_id)]

        mappings = await self.mappings.list_all()
        gaps = await self.gaps.list_all()
        maps_by_clause: dict[uuid.UUID, list] = {}
        for m in mappings:
            maps_by_clause.setdefault(m.clause_id, []).append(m)
        gaps_by_clause: dict[uuid.UUID, list] = {}
        for g in gaps:
            if g.clause_id and g.status not in ("resolved", "accepted_risk"):
                gaps_by_clause.setdefault(g.clause_id, []).append(g)

        clauses_out: list[dict] = []
        coverage: list[dict] = []
        cited_document_ids: set[uuid.UUID] = set()
        for reg in regulations:
            clauses = await self.clauses.list_for_regulation(reg.id)
            mapped = gapped = 0
            for c in clauses:
                cmaps = maps_by_clause.get(c.id, [])
                cgaps = gaps_by_clause.get(c.id, [])
                confirmed = [m for m in cmaps if m.status == "confirmed"]
                is_mapped = bool(confirmed) or (bool(cmaps) and not cgaps)
                if cgaps:
                    gapped += 1
                elif is_mapped:
                    mapped += 1
                for m in cmaps:
                    if m.target_type == "procedure_doc":
                        cited_document_ids.add(m.target_id)
                clauses_out.append({
                    "regulation_code": reg.code, "regulation_title": reg.title,
                    "clause_no": c.clause_no, "title": c.title, "text": c.text,
                    "status": "gap" if cgaps else ("mapped" if is_mapped else "unaddressed"),
                    "mappings": [{"target_type": m.target_type, "target_label": m.target_label,
                                  "confidence": float(m.mapping_confidence), "status": m.status,
                                  "citation": m.citation} for m in cmaps],
                    "gaps": [{"title": g.title, "severity": g.severity,
                              "explanation": g.ai_explanation} for g in cgaps]})
            total = len(clauses)
            coverage.append({"regulation_code": reg.code, "regulation_title": reg.title,
                             "clauses": total, "mapped": mapped, "gaps": gapped,
                             "coverage_pct": round(100.0 * mapped / total, 1) if total else 0.0})

        documents = await self._documents(cited_document_ids)
        return {"coverage": coverage, "clauses": clauses_out, "documents": documents,
                "generated_at": datetime.now(UTC)}

    async def _documents(self, ids: set[uuid.UUID]) -> list[Document]:
        if not ids:
            return []
        rows = (await self.session.execute(select(Document).where(
            Document.id.in_(ids), Document.tenant_id == self.tenant_id))).scalars().all()
        return list(rows)

    async def _build_zip(self, pdf_bytes: bytes, data: dict) -> tuple[bytes, dict]:
        buf = io.BytesIO()
        manifest: dict[str, Any] = {"summary_pdf": "evidence-summary.pdf", "sources": []}
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("evidence-summary.pdf", pdf_bytes)
            for doc in data["documents"]:
                if not doc.storage_key:
                    continue
                try:
                    raw = await _to_thread(storage.read_object, doc.storage_key)
                except Exception as exc:  # noqa: BLE001 — a missing source must not fail the package
                    log.warning("evidence_source_read_failed", document_id=str(doc.id), error=str(exc))
                    continue
                ext = doc.storage_key.rsplit(".", 1)[-1] if "." in doc.storage_key else "bin"
                name = f"sources/{doc.id}.{ext}"
                zf.writestr(name, raw)
                manifest["sources"].append({"document_id": str(doc.id), "title": doc.title,
                                            "file": name})
        return buf.getvalue(), manifest

    async def _progress(self, package_id, stage: str, pct: int) -> None:
        try:
            await progress.publish(self.tenant_id, {
                "type": "compliance.evidence.progress", "package_id": str(package_id),
                "stage": stage, "pct": pct})
        except Exception:  # noqa: BLE001 — progress is best-effort
            pass


def _render_pdf(data: dict) -> bytes:
    """Coverage table + per-clause evidence list (reportlab)."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    y = height - 60

    def line(text: str, *, font="Helvetica", size=10, dy=14, indent=50) -> None:
        nonlocal y
        if y < 60:
            c.showPage()
            y = height - 60
        c.setFont(font, size)
        c.drawString(indent, y, text[:110])
        y -= dy

    line("Compliance Evidence Package", font="Helvetica-Bold", size=16, dy=24)
    line(f"Generated {data['generated_at'].strftime('%Y-%m-%d %H:%M UTC')}", size=9, dy=22)

    line("Coverage Summary", font="Helvetica-Bold", size=12, dy=18)
    line("Regulation                         Clauses   Mapped   Gaps   Coverage",
         font="Helvetica-Bold", size=9)
    for row in data["coverage"]:
        line(f"{row['regulation_code']:<32} {row['clauses']:>7} {row['mapped']:>8} "
             f"{row['gaps']:>6} {row['coverage_pct']:>8}%", font="Courier", size=9)
    y -= 6

    line("Clause Evidence", font="Helvetica-Bold", size=12, dy=18)
    for cl in data["clauses"]:
        line(f"[{cl['status'].upper()}] {cl['regulation_code']} clause {cl['clause_no']}: "
             f"{cl['title'] or ''}", font="Helvetica-Bold", size=9)
        for m in cl["mappings"]:
            cite = m.get("citation") or {}
            page = f" p.{cite.get('page')}" if cite.get("page") else ""
            line(f"   [OK] {m['target_type']}: {m.get('target_label') or ''} "
                 f"({m['status']}, conf {m['confidence']:.2f}){page}", size=9)
        for g in cl["gaps"]:
            line(f"   [GAP {g['severity']}]: {g['explanation'] or g['title']}", size=9)
        y -= 4

    if not data["documents"]:
        line("No cited source documents in scope.", size=9, dy=16)
    else:
        line("Cited Source Documents", font="Helvetica-Bold", size=12, dy=18)
        for doc in data["documents"]:
            line(f"   - {doc.title}", size=9)

    c.showPage()
    c.save()
    return buf.getvalue()


async def _to_thread(fn, *args):
    import asyncio

    return await asyncio.to_thread(fn, *args)


def _enqueue(tenant_id, package_id) -> None:
    """Best-effort Celery dispatch — a missing broker must not fail the request."""
    try:
        from app.workers.tasks.compliance_tasks import generate_evidence_package

        generate_evidence_package.delay(str(tenant_id), str(package_id))
    except Exception as exc:  # noqa: BLE001 — no broker in some dev/test runs; the row stays generating
        log.warning("evidence_enqueue_failed", package_id=str(package_id), error=str(exc))
