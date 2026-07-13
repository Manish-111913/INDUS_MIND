"""Audit module — subscribes to the bus as an audit writer (docs/02 §34).

The event-bus subscriber that persists domain events as audit rows is wired when
the full audit module lands; direct `AuditService.write` calls cover mutations today.
"""

from __future__ import annotations
