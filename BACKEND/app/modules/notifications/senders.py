"""Notification channel senders (docs/02 §20, §34, §35).

Three channels behind a common signature:
  · in_app — persist a `notifications` row + publish WS `notification.new`
  · email  — SMTP (mailhog local / real SMTP prod), a templated plain+HTML body
  · push   — stub, logged (a real integration would call FCM/APNs here)
Email/push are best-effort: a delivery failure is logged and recorded, never
raised (a mail outage must not fail the originating transaction).
"""

from __future__ import annotations

import uuid

from app.core.config import settings
from app.core.logging import get_logger
from app.ws import progress

log = get_logger("notifications.senders")


async def send_in_app(notification) -> bool:
    """Publish the WS `notification.new` event for the notification's tenant channel."""
    try:
        await progress.publish(notification.tenant_id, {
            "type": "notification.new",
            "payload": {
                "id": str(notification.id),
                "user_id": str(notification.user_id),
                "category": notification.category,
                "priority": notification.priority,
                "title": notification.title,
                "body": notification.body,
                "entity_type": notification.entity_type,
                "entity_id": str(notification.entity_id) if notification.entity_id else None,
                "created_at": notification.created_at.isoformat() if notification.created_at else None,
            },
        })
        return True
    except Exception as exc:  # noqa: BLE001 — WS relay is best-effort
        log.warning("notification_ws_failed", notification_id=str(notification.id), error=str(exc))
        return False


async def send_email(*, to_email: str, subject: str, body: str) -> bool:
    """Send via SMTP (mailhog on :1025 locally). Best-effort."""
    import asyncio

    def _send() -> None:
        import smtplib
        from email.message import EmailMessage

        msg = EmailMessage()
        msg["From"] = settings.smtp_from
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.set_content(body)
        msg.add_alternative(
            f"<html><body style='font-family:sans-serif'>"
            f"<h3 style='color:#3E7BFA'>IndusMind</h3><p>{body}</p></body></html>",
            subtype="html")
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=5) as smtp:
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)

    try:
        await asyncio.to_thread(_send)
        return True
    except Exception as exc:  # noqa: BLE001 — mail outage must not fail the txn
        log.warning("notification_email_failed", to=to_email, error=str(exc))
        return False


async def send_push(*, user_id: uuid.UUID | str, title: str, body: str | None) -> bool:
    """Push stub — logged. A real integration would dispatch to FCM/APNs here."""
    log.info("notification_push_stub", user_id=str(user_id), title=title)
    return True
