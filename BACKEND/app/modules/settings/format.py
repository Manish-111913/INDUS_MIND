"""Locale-aware value formatting driven by the settings service (docs/05 S1, S6).

Exports must match what the user sees on screen, so both the UI and the export
path format through the same rules — resolved from the caller's effective
settings (`locale.date_format`, `locale.currency`, `units.*`). This module turns
an effective-settings map into a `Formatter`.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

# Minimal Unicode LDML date pattern → strftime (longest tokens first).
_LDML = [
    ("yyyy", "%Y"), ("yy", "%y"), ("MMMM", "%B"), ("MMM", "%b"), ("MM", "%m"),
    ("dd", "%d"), ("EEEE", "%A"), ("EEE", "%a"), ("HH", "%H"), ("mm", "%M"), ("ss", "%S"),
]

_CURRENCY_SYMBOLS = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£"}


def _to_strftime(pattern: str) -> str:
    out = pattern
    for ldml, sf in _LDML:
        out = out.replace(ldml, sf)
    return out


class Formatter:
    def __init__(self, effective: dict[str, Any] | None = None) -> None:
        eff = effective or {}
        self.date_pattern = eff.get("locale.date_format") or "dd MMM yyyy"
        self._strftime = _to_strftime(self.date_pattern)
        self.currency = eff.get("locale.currency") or "INR"
        self.pressure_unit = eff.get("units.pressure")
        self.temperature_unit = eff.get("units.temperature")

    def format_date(self, value: date | datetime | str) -> str:
        parsed: date | datetime | str = value
        if isinstance(value, str):
            try:
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                return value  # not a date at all — hand it back untouched
        if isinstance(parsed, (datetime, date)):
            return parsed.strftime(self._strftime)
        return str(parsed)

    def format_number(self, value: float | int | Decimal, *, decimals: int | None = None) -> str:
        num = float(value)
        if decimals is None:
            decimals = 0 if float(num).is_integer() else 2
        return f"{num:,.{decimals}f}"

    def format_currency(self, value: float | int | Decimal) -> str:
        symbol = _CURRENCY_SYMBOLS.get(self.currency, self.currency + " ")
        return f"{symbol}{self.format_number(value, decimals=2)}"

    def format_value(self, value: Any, kind: str | None = None) -> Any:
        """Format by a declared column kind (date|datetime|number|currency); else passthrough."""
        if value is None:
            return ""
        if kind in ("date", "datetime"):
            return self.format_date(value)
        if kind == "currency":
            return self.format_currency(value)
        if kind == "number":
            return self.format_number(value)
        if isinstance(value, (datetime, date)):
            return self.format_date(value)
        if isinstance(value, Decimal):
            return self.format_number(value)
        return value


async def formatter_for(session, tenant_id, user_id=None) -> Formatter:
    """Build a Formatter from the caller's effective settings."""
    from app.modules.settings.service import SettingsService

    eff = await SettingsService(session, tenant_id).effective(user_id)
    return Formatter(eff)
