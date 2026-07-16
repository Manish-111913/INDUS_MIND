"""Equipment label-sheet rendering (docs/08 N2).

Renders a 3×8 grid of QR labels (QR + mono tag + name) to an A4 PDF, stores it in
object storage, and notifies the requester with a download link — the same
delivery shape as an S6 export. ReportLab is used for the PDF (always present);
the spec names WeasyPrint but a label grid is trivial geometry, so ReportLab is
both sufficient and dependency-light here.
"""

from __future__ import annotations

import asyncio
import io
import uuid

from app.core.logging import get_logger

# Register cross-module models so SQLAlchemy resolves relationships in the worker.
from app.modules.auth import models as _auth  # noqa: E402,F401
from app.modules.equipment import models as _equipment  # noqa: E402,F401
from app.modules.tenants import models as _tenants  # noqa: E402,F401
from app.modules.users import models as _users  # noqa: E402,F401
from app.workers.celery_app import celery

log = get_logger("workers.equipment")

# 3 columns × 8 rows per A4 sheet.
_COLS, _ROWS = 3, 8


def _render_pdf(labels: list[tuple[str, str, bytes]]) -> bytes:
    """labels: [(tag, name, qr_png_bytes)] → A4 label-sheet PDF bytes."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    page_w, page_h = A4
    margin = 10 * mm
    cell_w = (page_w - 2 * margin) / _COLS
    cell_h = (page_h - 2 * margin) / _ROWS
    per_page = _COLS * _ROWS

    for i, (tag, name, qr_png) in enumerate(labels):
        slot = i % per_page
        if i > 0 and slot == 0:
            c.showPage()
        col = slot % _COLS
        row = slot // _COLS
        x = margin + col * cell_w
        # Rows fill top-to-bottom, but PDF y grows upward.
        y = page_h - margin - (row + 1) * cell_h

        qr_size = min(cell_w, cell_h) * 0.62
        qr_x = x + (cell_w - qr_size) / 2
        qr_y = y + cell_h - qr_size - 4 * mm
        c.drawImage(ImageReader(io.BytesIO(qr_png)), qr_x, qr_y, qr_size, qr_size)

        c.setFont("Courier-Bold", 10)
        c.drawCentredString(x + cell_w / 2, qr_y - 5 * mm, tag[:24])
        c.setFont("Helvetica", 7)
        c.drawCentredString(x + cell_w / 2, qr_y - 9 * mm, name[:34])

    c.showPage()
    c.save()
    return buf.getvalue()


async def _run(tenant_id: uuid.UUID, actor_id: uuid.UUID, equipment_ids: list[uuid.UUID]) -> str:
    from sqlalchemy import select

    from app.core import storage
    from app.core.database import SessionFactory
    from app.modules.equipment.models import Equipment
    from app.modules.equipment.qr_router import render_qr_png
    from app.modules.notifications.service import NotificationRouter

    async with SessionFactory() as session:
        base = "http://localhost:3000"
        try:
            from app.modules.settings.service import SettingsService

            base = (await SettingsService(session, tenant_id).effective(None)).get(
                "app.base_url", base)
        except Exception as exc:  # noqa: BLE001
            log.warning("label_base_url_failed", error=str(exc))

        rows = (await session.execute(
            select(Equipment).where(Equipment.tenant_id == tenant_id,
                                    Equipment.id.in_(equipment_ids)))).scalars().all()
        labels = [(e.tag, e.name, render_qr_png(f"{base}/eq/{e.tag}")) for e in rows]
        pdf = await asyncio.to_thread(_render_pdf, labels)

        key = f"tenant/{tenant_id}/exports/labels-{uuid.uuid4()}.pdf"
        await asyncio.to_thread(storage.put_object, key, pdf, "application/pdf")
        url = storage.presigned_get(key)

        await NotificationRouter(session, tenant_id).deliver(
            user_id=actor_id, category="system", priority="normal",
            title="Your equipment labels are ready",
            body=f"{len(labels)} label(s) rendered.", entity_type="export", entity_id=None,
            channels=["in_app", "email"], event_code="export.completed",
            payload={"entity": "equipment_labels", "row_count": len(labels), "download_url": url,
                     "file_name": key.rsplit("/", 1)[-1]})
        await session.commit()
        log.info("equipment_labels_rendered", count=len(labels), key=key)
        return key


@celery.task(name="app.workers.tasks.equipment_tasks.render_label_sheet")
def render_label_sheet(tenant_id: str, actor_id: str, equipment_ids: list[str]) -> str:
    return asyncio.run(_run(uuid.UUID(tenant_id), uuid.UUID(actor_id),
                            [uuid.UUID(i) for i in equipment_ids]))
