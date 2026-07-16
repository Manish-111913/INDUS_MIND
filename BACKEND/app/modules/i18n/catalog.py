"""Seed i18n bundles (docs/08 S9).

`en` is shipped complete for the eight namespaces; `hi` covers nav/auth/copilot
only (the demo flourish). Keys not present in `hi` fall back to `en` at request
time and are logged as gaps — which is the point of the gaps table.
"""

from __future__ import annotations

# locale → namespace → {key: value}
BUNDLES: dict[str, dict[str, dict[str, str]]] = {
    "en": {
        "common": {
            "save": "Save", "cancel": "Cancel", "delete": "Delete", "edit": "Edit",
            "create": "Create", "search": "Search", "loading": "Loading…",
            "no_results": "No results", "confirm": "Confirm", "close": "Close",
            "actions": "Actions", "yes": "Yes", "no": "No",
        },
        "nav": {
            "dashboard": "Dashboard", "copilot": "Copilot", "documents": "Documents",
            "knowledge_graph": "Knowledge Graph", "equipment": "Equipment",
            "maintenance": "Maintenance", "compliance": "Compliance",
            "lessons": "Lessons Learned", "quality": "Quality",
            "notifications": "Notifications", "analytics": "Analytics", "admin": "Admin",
            "logbook": "Shift Logbook", "parts": "Spare Parts",
        },
        "auth": {
            "login": "Log in", "logout": "Log out", "email": "Email",
            "password": "Password", "forgot_password": "Forgot password?",
            "reset_password": "Reset password", "sign_in": "Sign in",
            "remember_me": "Remember me", "new_password": "New password",
            "current_password": "Current password", "change_password": "Change password",
        },
        "copilot": {
            "ask_placeholder": "Ask about your plant…", "sources": "Sources",
            "thinking": "Thinking…", "cited": "Cited from", "no_answer": "I don't have enough "
            "information in the documents to answer that.", "send": "Send",
        },
        "maintenance": {
            "work_orders": "Work Orders", "schedules": "Schedules",
            "predictions": "Predictions", "rca": "Root Cause Analysis",
            "create_wo": "Create work order", "close_wo": "Close work order",
        },
        "compliance": {
            "regulations": "Regulations", "gaps": "Gaps", "audits": "Audits",
            "evidence": "Evidence Packages", "coverage": "Coverage",
        },
        "admin": {
            "users": "Users", "roles": "Roles", "settings": "Settings",
            "integrations": "Integrations", "extraction_rules": "Extraction Rules",
            "audit_log": "Audit Log", "translations": "Translations", "retention": "Retention",
        },
        "errors": {
            "not_found": "Not found", "forbidden": "You don't have access to this",
            "server_error": "Something went wrong", "network": "Network error — try again",
            "unauthorized": "Please log in to continue", "request_id": "Request ID",
        },
    },
    "hi": {
        "nav": {
            "dashboard": "डैशबोर्ड", "copilot": "कोपायलट", "documents": "दस्तावेज़",
            "knowledge_graph": "ज्ञान ग्राफ़", "equipment": "उपकरण",
            "maintenance": "रखरखाव", "compliance": "अनुपालन",
            "lessons": "सीखे गए सबक", "quality": "गुणवत्ता",
            "notifications": "सूचनाएँ", "analytics": "विश्लेषण", "admin": "व्यवस्थापक",
            "logbook": "शिफ्ट लॉगबुक", "parts": "स्पेयर पार्ट्स",
        },
        "auth": {
            "login": "लॉग इन करें", "logout": "लॉग आउट", "email": "ईमेल",
            "password": "पासवर्ड", "forgot_password": "पासवर्ड भूल गए?",
            "reset_password": "पासवर्ड रीसेट करें", "sign_in": "साइन इन करें",
            "change_password": "पासवर्ड बदलें",
        },
        "copilot": {
            "ask_placeholder": "अपने संयंत्र के बारे में पूछें…", "sources": "स्रोत",
            "thinking": "सोच रहा है…", "cited": "से उद्धृत", "send": "भेजें",
        },
    },
}

# (code, name, native_name, is_default)
LOCALES = [
    ("en", "English", "English", True),
    ("hi", "Hindi", "हिन्दी", False),
]
