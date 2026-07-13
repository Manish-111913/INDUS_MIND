"""Minimal SMTP sender (docs/02 §49 SMTP_*; local = mailhog on :1025).

stdlib smtplib is synchronous, so sends run in a worker thread to avoid blocking
the event loop. No auth for mailhog; STARTTLS/creds used when configured.
"""

from __future__ import annotations

import asyncio
import smtplib
from email.message import EmailMessage

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("core.email")


def _send_sync(to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        if settings.smtp_user:
            smtp.starttls()
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(msg)


async def send_email(to: str, subject: str, body: str) -> None:
    try:
        await asyncio.to_thread(_send_sync, to, subject, body)
        log.info("email_sent", to=to, subject=subject)
    except Exception as exc:  # noqa: BLE001 — email must never break the request path
        log.error("email_failed", to=to, subject=subject, error=str(exc))
