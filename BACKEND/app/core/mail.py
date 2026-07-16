"""Mail provider adapter (docs/05 S3 — mirrors the LLM/OCR adapters).

A single `send(...)` seam behind a `MailProvider` ABC so the delivery backend is
a config choice, never hardcoded in call sites:

  · ``smtp`` — SMTP (MailHog on :1025 locally, real SMTP in prod)
  · ``ses``  — AWS SES (lazy boto3, like the OCR Textract provider)

Selected by ``settings.mail_provider``. Providers lazy-import their SDK so the
app boots without it installed. Delivery is best-effort at the *call site* (a mail
outage must never fail the originating transaction); this module raises so the
caller can log/record the failure, matching `core/llm.py`'s ExternalServiceError.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from app.core.config import settings
from app.core.exceptions import ExternalServiceError
from app.core.logging import get_logger

log = get_logger("core.mail")


@dataclass(slots=True)
class MailResult:
    provider: str
    provider_msg_id: str | None = None


def _html_wrap(body: str) -> str:
    return (
        "<html><body style='font-family:sans-serif'>"
        "<h3 style='color:#3E7BFA'>IndusMind</h3>"
        f"<div>{body}</div></body></html>"
    )


class MailProvider(ABC):
    name: str

    @abstractmethod
    def send(self, *, to_email: str, subject: str, body: str,
             html: str | None = None) -> MailResult: ...


class SmtpProvider(MailProvider):
    """SMTP via the stdlib — MailHog locally, real SMTP relay in prod."""

    name = "smtp"

    def send(self, *, to_email, subject, body, html=None) -> MailResult:
        import smtplib
        from email.message import EmailMessage

        msg = EmailMessage()
        msg["From"] = settings.smtp_from
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.set_content(body)
        msg.add_alternative(html or _html_wrap(body), subtype="html")
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=5) as smtp:
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)
        return MailResult(provider=self.name, provider_msg_id=msg.get("Message-ID"))


class SesProvider(MailProvider):
    """AWS SES via boto3 (lazy import). Prod delivery adapter."""

    name = "ses"

    def send(self, *, to_email, subject, body, html=None) -> MailResult:
        import boto3  # lazy

        client = boto3.client("ses", region_name=settings.aws_region)
        resp = client.send_email(
            Source=settings.smtp_from,
            Destination={"ToAddresses": [to_email]},
            Message={
                "Subject": {"Data": subject},
                "Body": {
                    "Text": {"Data": body},
                    "Html": {"Data": html or _html_wrap(body)},
                },
            },
        )
        return MailResult(provider=self.name, provider_msg_id=resp.get("MessageId"))


_PROVIDERS: dict[str, type[MailProvider]] = {"smtp": SmtpProvider, "ses": SesProvider}


def get_provider() -> MailProvider:
    return _PROVIDERS.get(settings.mail_provider, SmtpProvider)()


async def send_mail(*, to_email: str, subject: str, body: str,
                    html: str | None = None) -> MailResult:
    """Deliver via the configured provider. Raises ExternalServiceError on failure
    so callers can record the outcome (they decide whether to swallow it)."""
    import asyncio

    provider = get_provider()
    try:
        return await asyncio.to_thread(
            provider.send, to_email=to_email, subject=subject, body=body, html=html)
    except Exception as exc:  # noqa: BLE001
        raise ExternalServiceError(f"Mail send failed: {exc}", code="MAIL_FAILED") from exc
