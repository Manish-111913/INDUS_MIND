"""Page thumbnail generation (docs/02 §12).

Renders each PDF page (or a single image) to a webp and stores it at
`tenant/{tid}/documents/{id}/thumbnails/page-{n}.webp`. Thumbnails are
rebuildable (never the source of truth). Runs in the parse stage.
"""

from __future__ import annotations

import io
import uuid

from app.core import storage
from app.core.logging import get_logger

log = get_logger("ingestion.thumbnails")

_THUMB_WIDTH = 800


def generate_thumbnails(tenant_id: uuid.UUID | str, document_id: uuid.UUID | str,
                        data: bytes, mime: str) -> int:
    try:
        if mime == "application/pdf":
            return _pdf_thumbnails(tenant_id, document_id, data)
        if mime.startswith("image/"):
            _store(tenant_id, document_id, 1, _to_webp(data))
            return 1
    except Exception as exc:  # noqa: BLE001 — thumbnails are optional, never block ingest
        log.warning("thumbnail_generation_failed", error=str(exc))
    return 0


def _pdf_thumbnails(tenant_id, document_id, data: bytes) -> int:
    import fitz  # lazy

    count = 0
    with fitz.open(stream=data, filetype="pdf") as doc:
        for index in range(doc.page_count):
            pix = doc.load_page(index).get_pixmap(dpi=110)
            _store(tenant_id, document_id, index + 1, _to_webp(pix.tobytes("png")))
            count += 1
    return count


def _to_webp(png_or_img_bytes: bytes) -> bytes:
    from PIL import Image  # lazy

    img = Image.open(io.BytesIO(png_or_img_bytes)).convert("RGB")
    if img.width > _THUMB_WIDTH:
        ratio = _THUMB_WIDTH / img.width
        img = img.resize((_THUMB_WIDTH, int(img.height * ratio)))
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=80)
    return buf.getvalue()


def _store(tenant_id, document_id, page: int, webp: bytes) -> None:
    key = storage.thumbnail_key(str(tenant_id), str(document_id), page)
    storage.put_object(key, webp, content_type="image/webp")
