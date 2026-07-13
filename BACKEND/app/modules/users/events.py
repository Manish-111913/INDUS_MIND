"""Users module events (docs/02 §34).

Publishes `user.role_changed` on role assignment / role-permission edits so the
permission-cache invalidator and notification routers can react.
"""

from __future__ import annotations

from app.core.events import EventType

USERS_EVENTS = [EventType.USER_ROLE_CHANGED]
