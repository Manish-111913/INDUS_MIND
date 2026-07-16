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


async def send_email(*, to_email: str, subject: str, body: str, html: str | None = None) -> bool:
    """Send via the configured MailProvider (SMTP/mailhog local, SES prod). Best-effort."""
    from app.core.mail import send_mail

    try:
        await send_mail(to_email=to_email, subject=subject, body=body, html=html)
        return True
    except Exception as exc:  # noqa: BLE001 — mail outage must not fail the txn
        log.warning("notification_email_failed", to=to_email, error=str(exc))
        return False


async def send_email_logged(session, tenant_id, *, to_email: str, subject: str, body: str,
                            html: str | None = None, template_id=None) -> bool:
    """Send an email and record the attempt in outbound_email_log (docs/05 S3)."""
    from app.core.mail import send_mail
    from app.modules.notifications.repository import OutboundEmailRepository

    repo = OutboundEmailRepository(session, tenant_id)
    try:
        result = await send_mail(to_email=to_email, subject=subject, body=body, html=html)
        await repo.log(to_email=to_email, subject=subject, status="sent",
                       template_id=template_id, provider_msg_id=result.provider_msg_id)
        return True
    except Exception as exc:  # noqa: BLE001 — mail outage must not fail the txn
        log.warning("notification_email_failed", to=to_email, error=str(exc))
        await repo.log(to_email=to_email, subject=subject, status="failed",
                       template_id=template_id, error=str(exc))
        return False


async def send_push(*, user_id: uuid.UUID | str, title: str, body: str | None) -> bool:
    """Push stub — logged. A real integration would dispatch to FCM/APNs here."""
    log.info("notification_push_stub", user_id=str(user_id), title=title)
    return True
