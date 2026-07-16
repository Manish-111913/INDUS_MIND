"""Seed content for the guided tour + changelog (docs/05 S10).

Seeded as system rows (tenant_id NULL) so every tenant gets them and an admin can
override per tenant. `selector` values must match the real DOM hooks in the
frontend shell — a stale selector makes the tour silently skip that step, so they
are listed here next to each other rather than scattered.
"""

from __future__ import annotations

# (order_no, selector, title, body, placement)
MAIN_TOUR_STEPS: list[tuple[int, str | None, str, str, str]] = [
    (1, "[data-tour='sidebar']", "Everything in one place",
     "Documents, equipment, maintenance, and compliance all live here — filtered to "
     "what your role can see.", "right"),
    (2, "[data-tour='copilot']", "Ask the Copilot",
     "Ask a plant question in plain English. Every answer cites the document and page "
     "it came from, so you can check it.", "right"),
    (3, "[data-tour='search']", "Search across everything",
     "Hybrid keyword + semantic search over every ingested manual, P&ID, and shift log.",
     "bottom"),
    (4, "[data-tour='documents']", "Upload and it self-organises",
     "Drop in a manual or report. It's parsed, chunked, embedded, and the equipment "
     "tags inside it are extracted and linked automatically.", "right"),
    (5, "[data-tour='equipment']", "Equipment 360",
     "One page per asset: history, documents, meter readings, failures, and open work "
     "orders.", "right"),
    (6, "[data-tour='maintenance']", "Predict, don't react",
     "Predictions flag assets trending toward failure so a work order can be raised "
     "before the breakdown.", "right"),
    (7, "[data-tour='compliance']", "Audit-ready evidence",
     "Regulations map to your procedures, gaps are surfaced, and an evidence package "
     "exports as a single PDF.", "right"),
    (8, "[data-tour='notifications']", "You'll be told",
     "Assignments, predictive alerts, and compliance gaps arrive here and by email — "
     "per your notification preferences.", "left"),
]

# (version, title, body_md, days_ago)
# days_ago (not absolute dates) so the demo always looks recent.
CHANGELOG_ENTRIES: list[tuple[str, str, str, int]] = [
    ("0.4.0", "Configurable extraction rules", """
Entity extraction is now driven by rules you control, not patterns baked into the code.

- **Admin → Extraction Rules** — add regex, keyword, or LLM-hint rules per entity type
- Test any pattern against sample text before saving, with matches highlighted
- Rules are versioned, and every extracted entity records which rule and version found it
""".strip(), 2),
    ("0.3.0", "Integrations: API keys and webhooks", """
Connect IndusMind to SAP PM, Maximo, or anything else that speaks HTTP.

- **API keys** with scoped permissions (`Admin → Integrations`)
- **Webhooks** — subscribe to failure, work-order, and compliance events
- Every delivery is HMAC-signed, retried with backoff, and visible in a delivery log
""".strip(), 16),
    ("0.2.0", "Import, export, and scheduled reports", """
Bulk data in, branded PDFs out.

- CSV/XLSX import with validation and a downloadable per-row error report
- Export any table view, honouring your saved columns and filters
- Schedule a report and have it emailed on a cron
""".strip(), 45),
]
