"""Auth module event surface (docs/02 §34).

The auth service publishes these typed events on `app.core.events.bus`:
  user.logged_in · user.login_failed · user.logged_out ·
  auth.refresh_reuse_detected · auth.password_reset_requested ·
  auth.password_reset_completed · auth.mfa_enabled
Subscribers (notifications, audit, security alerting) attach as they land.
"""

from __future__ import annotations

from app.core.events import EventType

AUTH_EVENTS = [
    EventType.USER_LOGGED_IN,
    EventType.USER_LOGIN_FAILED,
    EventType.USER_LOGGED_OUT,
    EventType.REFRESH_REUSE_DETECTED,
    EventType.PASSWORD_RESET_REQUESTED,
    EventType.PASSWORD_RESET_COMPLETED,
    EventType.MFA_ENABLED,
]
