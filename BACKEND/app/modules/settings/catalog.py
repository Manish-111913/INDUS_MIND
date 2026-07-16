"""Seed catalog for the settings service (docs/05 S1).

These are *definitions* (metadata) only — the actual values resolve from the
database (settings_values overrides + the definition's default_value), never from
Python constants. The seed script inserts these rows; nothing here is read at
runtime as a live config value.

Row shape: (key, value_type, enum_options, default_value, scope, category, label,
description, is_public).
  · value_type ∈ string|int|bool|json|enum
  · scope      ∈ system|tenant|plant|user  (broadest level this setting targets)
  · is_public  → exposed in /settings/effective to any authenticated caller
"""

from __future__ import annotations

from typing import Any

# key, value_type, enum_options, default_value, scope, category, label, description, is_public
SETTINGS_DEFINITIONS: list[tuple[str, str, list[str] | None, Any, str, str, str, str, bool]] = [
    ("locale.currency", "string", None, "INR", "user", "locale",
     "Currency", "ISO currency code used to format money values.", True),
    ("locale.date_format", "string", None, "dd MMM yyyy", "user", "locale",
     "Date format", "Display format for dates (Unicode LDML pattern).", True),
    ("locale.timezone", "string", None, "Asia/Kolkata", "user", "locale",
     "Timezone", "IANA timezone used to render timestamps.", True),
    ("units.system", "enum", ["metric", "imperial"], "metric", "user", "units",
     "Unit system", "Base measurement system.", True),
    ("units.pressure", "enum", ["bar", "psi", "kPa"], "bar", "user", "units",
     "Pressure unit", "Unit for pressure readings.", True),
    ("units.temperature", "enum", ["C", "F"], "C", "user", "units",
     "Temperature unit", "Unit for temperature readings.", True),
    ("ai.default_confidence_threshold", "json", None, 0.7, "tenant", "ai",
     "Default AI confidence threshold", "Fallback confidence gate for AI outputs.", False),
    ("ingestion.max_file_mb", "int", None, 25, "tenant", "ingestion",
     "Max upload size (MB)", "Maximum accepted file size for uploads.", False),
    ("retention.audit_log_days", "int", None, 365, "tenant", "retention",
     "Audit log retention (days)", "How long audit-log rows are kept.", False),
    # ── B19 (docs/08) ──────────────────────────────────────────────────────────
    # Public base URL used to build absolute links (reset emails, QR codes). Public
    # so the frontend can render QR targets without a round-trip.
    ("app.base_url", "string", None, "http://localhost:3000", "tenant", "app",
     "Application base URL", "Public URL used to build links (reset emails, QR codes).", True),
    ("locale.language", "enum", ["en", "hi"], "en", "user", "locale",
     "Language", "UI language; drives i18n bundle selection and label translation.", True),
    ("auth.reset_token_ttl_minutes", "int", None, 30, "tenant", "auth",
     "Password-reset link TTL (minutes)", "How long a reset link stays valid.", False),
    # Password policy as JSON so the same rule drives backend validation and the
    # frontend strength meter — no divergent copies.
    ("auth.password_policy", "json", None,
     {"min_length": 10, "require_number": True, "require_symbol": True}, "tenant", "auth",
     "Password policy", "Minimum length and character-class requirements for passwords.", True),
    # Retention defaults (docs/08 S14) — the seeder reads retention.*_days from here.
    ("retention.notifications_days", "int", None, 180, "tenant", "retention",
     "Notifications retention (days)", "How long notification rows are kept.", False),
    ("retention.chat_sessions_days", "int", None, 365, "tenant", "retention",
     "Chat retention (days)", "How long copilot chat sessions are kept.", False),
    ("retention.ingestion_jobs_days", "int", None, 90, "tenant", "retention",
     "Ingestion-job retention (days)", "How long ingestion job records are kept.", False),
    ("retention.webhook_deliveries_days", "int", None, 30, "tenant", "retention",
     "Webhook-delivery retention (days)", "How long webhook delivery records are kept.", False),
    ("retention.ai_usage_days", "int", None, 365, "tenant", "retention",
     "AI-usage retention (days)", "How long AI usage/cost rows are kept.", False),
    ("retention.report_runs_days", "int", None, 180, "tenant", "retention",
     "Report-run retention (days)", "How long report run records are kept.", False),
    ("branding.logo_url", "string", None, "", "tenant", "branding",
     "Logo URL", "Tenant logo shown in the app shell.", True),
    ("branding.app_name", "string", None, "IndusMind", "tenant", "branding",
     "Application name", "Product name shown in the UI.", True),
    # Predictive-maintenance signal weights (docs/05 S5) — no constants in code.
    ("prediction.weight_trend", "json", None, 0.20, "tenant", "prediction",
     "Weight: reading trend", "Weight of the worsening-reading-trend signal.", False),
    ("prediction.weight_threshold", "json", None, 0.15, "tenant", "prediction",
     "Weight: threshold proximity", "Weight of proximity to a meter's normal band.", False),
    ("prediction.weight_failure_freq", "json", None, 0.20, "tenant", "prediction",
     "Weight: failure frequency", "Weight of recorded failure count.", False),
    ("prediction.weight_repeat_mode", "json", None, 0.15, "tenant", "prediction",
     "Weight: repeat failure mode", "Weight of a recurring dominant failure mode.", False),
    ("prediction.weight_overdue", "json", None, 0.20, "tenant", "prediction",
     "Weight: overdue maintenance", "Weight of the worst overdue schedule.", False),
    ("prediction.weight_criticality", "json", None, 0.10, "tenant", "prediction",
     "Weight: criticality", "Weight of equipment criticality.", False),
    ("prediction.reading_window_n", "int", None, 20, "tenant", "prediction",
     "Reading window (N)", "Number of recent readings used for the trend signal.", False),
]
