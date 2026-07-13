"""OCR provider adapter skeleton (docs/02 §10).

Interfaces only for now: digital PDFs → text layer (PyMuPDF); scanned/images →
PaddleOCR (local) / Textract (prod); P&IDs → vision-LLM pass. Concrete
implementations arrive with the ingestion pipeline.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from app.core.config import settings


@dataclass(slots=True)
class OCRPage:
    page_no: int
    text: str
    confidence: float = 1.0
    bbox_blocks: list[dict] = field(default_factory=list)


@dataclass(slots=True)
class OCRResult:
    pages: list[OCRPage]
    provider: str


class OCRProvider(ABC):
    name: str

    @abstractmethod
    async def extract(self, storage_key: str, *, mime: str) -> OCRResult: ...


class NotConfiguredOCR(OCRProvider):
    name = "not_configured"

    async def extract(self, storage_key: str, *, mime: str) -> OCRResult:
        raise NotImplementedError("OCR provider not yet implemented (skeleton, docs/02 §10)")


def get_ocr_provider(provider: str | None = None) -> OCRProvider:
    _ = provider or settings.ocr_provider
    return NotConfiguredOCR()
