"""Global lookup seed data (docs/02 §7 lookups, §27).

All dropdown/option sets live in the `lookups` table — nothing hardcoded in the
UI. These are seeded as global (tenant_id NULL) defaults; tenants may add their
own rows per category. Categories requested for B2:
doc_types, wo_types, priorities, failure_codes, failure_modes, entity_types,
notification_categories, criticality, defect_types.
"""

from __future__ import annotations

# category → list of (code, label, sort, meta)
LOOKUP_SEED: dict[str, list[tuple[str, str, int, dict]]] = {
    "doc_types": [
        ("pid", "P&ID", 1, {}),
        ("work_order", "Work Order", 2, {}),
        ("sop", "SOP / Procedure", 3, {}),
        ("inspection_report", "Inspection Report", 4, {}),
        ("manual", "OEM Manual", 5, {}),
        ("incident_report", "Incident Report", 6, {}),
        ("drawing", "Engineering Drawing", 7, {}),
        ("regulation", "Regulation", 8, {}),
        ("email", "Email", 9, {}),
        ("spec_sheet", "Spec Sheet", 10, {}),
    ],
    "wo_types": [
        ("preventive", "Preventive", 1, {}),
        ("corrective", "Corrective", 2, {}),
        ("predictive", "Predictive", 3, {}),
        ("inspection", "Inspection", 4, {}),
    ],
    "priorities": [
        ("critical", "Critical", 1, {"color": "#E5484D"}),
        ("high", "High", 2, {"color": "#F5A524"}),
        ("medium", "Medium", 3, {"color": "#3E7BFA"}),
        ("low", "Low", 4, {"color": "#2E9E5B"}),
    ],
    "failure_codes": [
        ("bearing_failure", "Bearing Failure", 1, {}),
        ("seal_leak", "Seal Leak", 2, {}),
        ("motor_burnout", "Motor Burnout", 3, {}),
        ("corrosion", "Corrosion", 4, {}),
        ("vibration_high", "High Vibration", 5, {}),
        ("overheating", "Overheating", 6, {}),
        ("misalignment", "Misalignment", 7, {}),
        ("cavitation", "Cavitation", 8, {}),
    ],
    "failure_modes": [
        ("wear", "Wear", 1, {}),
        ("fatigue", "Fatigue", 2, {}),
        ("corrosion", "Corrosion", 3, {}),
        ("fracture", "Fracture", 4, {}),
        ("leakage", "Leakage", 5, {}),
        ("blockage", "Blockage", 6, {}),
        ("electrical_fault", "Electrical Fault", 7, {}),
        ("overheating", "Overheating", 8, {}),
    ],
    "entity_types": [
        ("equipment_tag", "Equipment Tag", 1, {}),
        ("parameter", "Parameter", 2, {}),
        ("regulation_ref", "Regulation Reference", 3, {}),
        ("person", "Person", 4, {}),
        ("date", "Date", 5, {}),
        ("material", "Material", 6, {}),
        ("failure_mode", "Failure Mode", 7, {}),
        ("procedure_ref", "Procedure Reference", 8, {}),
    ],
    "notification_categories": [
        ("wo_assigned", "Work Order Assigned", 1, {"priority": "high"}),
        ("gap_detected", "Compliance Gap Detected", 2, {"priority": "high"}),
        ("prediction", "Predictive Alert", 3, {"priority": "high"}),
        ("doc_processed", "Document Processed", 4, {"priority": "normal"}),
        ("mention", "Mention", 5, {"priority": "normal"}),
        ("digest", "Digest", 6, {"priority": "low"}),
        ("safety_alert", "Safety Alert", 7, {"priority": "critical"}),
        ("system", "System", 8, {"priority": "low"}),
    ],
    "criticality": [
        ("A", "A — Critical", 1, {}),
        ("B", "B — Important", 2, {}),
        ("C", "C — Standard", 3, {}),
    ],
    "equipment_types": [
        ("pump", "Pump", 1, {}),
        ("compressor", "Compressor", 2, {}),
        ("valve", "Valve", 3, {}),
        ("transformer", "Transformer", 4, {}),
        ("motor", "Motor", 5, {}),
        ("heat_exchanger", "Heat Exchanger", 6, {}),
        ("tank", "Tank / Vessel", 7, {}),
        ("turbine", "Turbine", 8, {}),
        ("boiler", "Boiler", 9, {}),
        ("instrument", "Instrument", 10, {}),
    ],
    "equipment_status": [
        ("operational", "Operational", 1, {"color": "#2E9E5B"}),
        ("standby", "Standby", 2, {"color": "#3E7BFA"}),
        ("maintenance", "Under Maintenance", 3, {"color": "#F5A524"}),
        ("down", "Down", 4, {"color": "#E5484D"}),
        ("decommissioned", "Decommissioned", 5, {}),
    ],
    "defect_types": [
        ("dimensional", "Dimensional", 1, {}),
        ("surface_finish", "Surface Finish", 2, {}),
        ("material", "Material", 3, {}),
        ("assembly", "Assembly", 4, {}),
        ("contamination", "Contamination", 5, {}),
        ("weld_defect", "Weld Defect", 6, {}),
    ],
    # Measurement units for meter definitions (docs/05 S5).
    "units": [
        ("mm_s", "mm/s (vibration velocity)", 1, {}),
        ("um", "µm (displacement)", 2, {}),
        ("celsius", "°C", 3, {}),
        ("fahrenheit", "°F", 4, {}),
        ("bar", "bar", 5, {}),
        ("psi", "psi", 6, {}),
        ("kpa", "kPa", 7, {}),
        ("rpm", "rpm", 8, {}),
        ("amp", "A (current)", 9, {}),
        ("hours", "hours (runtime)", 10, {}),
    ],
    # Shift codes for the logbook (docs/08 S13).
    "shifts": [
        ("morning", "Morning", 1, {}),
        ("evening", "Evening", 2, {}),
        ("night", "Night", 3, {}),
    ],
    # Bulk-action menus per resource (docs/08 N4) — the frontend reads these so
    # available actions aren't hardcoded in JSX.
    "bulk_actions_work_orders": [
        ("assign", "Assign to…", 1, {}),
        ("status", "Change status", 2, {}),
        ("export", "Export selected", 3, {}),
    ],
    "bulk_actions_documents": [
        ("tag", "Add tag", 1, {}),
        ("reingest", "Re-ingest", 2, {}),
        ("delete", "Delete", 3, {}),
    ],
    "bulk_actions_notifications": [
        ("mark_read", "Mark as read", 1, {}),
    ],
    # Reason codes for a 👎 on a copilot answer (docs/05 S4).
    "ai_feedback_reason": [
        ("incorrect", "Incorrect answer", 1, {}),
        ("incomplete", "Incomplete answer", 2, {}),
        ("irrelevant", "Not relevant", 3, {}),
        ("outdated", "Outdated information", 4, {}),
        ("no_citation", "Missing / wrong citation", 5, {}),
        ("unsafe", "Unsafe recommendation", 6, {}),
        ("other", "Other", 7, {}),
    ],
}
