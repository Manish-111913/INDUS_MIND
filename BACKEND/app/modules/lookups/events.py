"""Lookups module events (docs/02 §34).

Lookup edits should bust the lookups cache (docs/02 §31). The cache-invalidation
subscriber attaches when the caching layer lands; writes go through the service today.
"""

from __future__ import annotations

# Reserved: lookup.changed published via app.core.events.bus.
