"""Documents module events (docs/02 §34).

Publishes document.uploaded (on confirm / new-version confirm) and
document.reprocess. The ingestion pipeline (B5) subscribes to these to run the
OCR → parse → chunk → embed → extract → graph chain.
"""

from __future__ import annotations

from app.core.events import EventType

DOCUMENT_EVENTS = [
    EventType.DOCUMENT_UPLOADED,
    EventType.DOCUMENT_REPROCESS,
]
