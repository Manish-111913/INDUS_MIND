"""OCR / text-extraction adapter (docs/02 §10 step 1).

Digital PDFs use the PyMuPDF text layer (no OCR); scanned pages / images go
through the OCR engine (PaddleOCR local → pytesseract fallback → Textract in
prod). Everything is lazy-imported so the app boots without the heavy deps; the
worker image installs them.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.core.config import settings
from app.core.exceptions import ExternalServiceError
from app.core.logging import get_logger

log = get_logger("core.ocr")

# Below this many characters a PDF page is treated as scanned → OCR.
_DIGITAL_TEXT_THRESHOLD = 20


@dataclass(slots=True)
class OCRBlock:
    text: str
    bbox: list[float]  # [x0, y0, x1, y1]


@dataclass(slots=True)
class OCRPage:
    page_no: int
    text: str
    source: str = "digital"  # digital | ocr
    confidence: float = 1.0
    blocks: list[OCRBlock] = field(default_factory=list)


def extract_pages(data: bytes, mime: str) -> list[OCRPage]:
    """Return per-page text + block bboxes for a document's original bytes."""
    if mime == "application/pdf":
        return _extract_pdf(data)
    if mime.startswith("image/"):
        return [_ocr_image(data, page_no=1)]
    # Non-PDF/image types are handled by the parser (docx/xlsx/msg); no OCR needed.
    return []


def _extract_pdf(data: bytes) -> list[OCRPage]:
    import fitz  # PyMuPDF (lazy)

    pages: list[OCRPage] = []
    with fitz.open(stream=data, filetype="pdf") as doc:
        for index in range(doc.page_count):
            page = doc.load_page(index)
            text = page.get_text("text").strip()
            blocks = [
                OCRBlock(text=b[4].strip(), bbox=[b[0], b[1], b[2], b[3]])
                for b in page.get_text("blocks") if b[4].strip()
            ]
            if len(text) >= _DIGITAL_TEXT_THRESHOLD:
                pages.append(OCRPage(page_no=index + 1, text=text, source="digital", blocks=blocks))
            else:
                # Scanned page: render to image and OCR it.
                pix = page.get_pixmap(dpi=200)
                pages.append(_ocr_image(pix.tobytes("png"), page_no=index + 1))
    return pages


def _ocr_image(data: bytes, *, page_no: int) -> OCRPage:
    provider = settings.ocr_provider
    try:
        if provider == "textract":
            return _ocr_textract(data, page_no)
        return _ocr_local(data, page_no)
    except ExternalServiceError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise ExternalServiceError(f"OCR failed: {exc}", code="OCR_FAILED") from exc


def _ocr_local(data: bytes, page_no: int) -> OCRPage:
    # PaddleOCR preferred; pytesseract fallback. Both lazy.
    try:
        from paddleocr import PaddleOCR  # type: ignore

        import numpy as np
        from PIL import Image
        import io

        engine = _paddle()
        img = np.array(Image.open(io.BytesIO(data)).convert("RGB"))
        result = engine.ocr(img, cls=True)
        lines = [line[1][0] for block in (result or []) for line in (block or [])]
        conf = [line[1][1] for block in (result or []) for line in (block or [])]
        return OCRPage(page_no=page_no, text="\n".join(lines), source="ocr",
                       confidence=sum(conf) / len(conf) if conf else 0.0)
    except ImportError:
        pass
    try:
        import io

        import pytesseract
        from PIL import Image

        text = pytesseract.image_to_string(Image.open(io.BytesIO(data)))
        return OCRPage(page_no=page_no, text=text.strip(), source="ocr", confidence=0.0)
    except Exception as exc:  # noqa: BLE001
        raise ExternalServiceError(
            "No OCR engine available (install paddleocr or pytesseract)", code="OCR_UNAVAILABLE"
        ) from exc


def _ocr_textract(data: bytes, page_no: int) -> OCRPage:  # pragma: no cover — prod path
    import boto3

    client = boto3.client("textract", region_name=settings.aws_region)
    resp = client.detect_document_text(Document={"Bytes": data})
    lines = [b["Text"] for b in resp.get("Blocks", []) if b["BlockType"] == "LINE"]
    return OCRPage(page_no=page_no, text="\n".join(lines), source="ocr")


_PADDLE = None


def _paddle():  # pragma: no cover — needs the heavy model
    global _PADDLE
    if _PADDLE is None:
        from paddleocr import PaddleOCR  # type: ignore

        _PADDLE = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
    return _PADDLE
