"""Canonical permission catalog + system-role matrix (docs/01 §22).

Single source of truth for seeding. Permissions are `resource.action` codes;
roles are bundles of them. The explicit rows in docs/01 §22 are honoured exactly;
unspecified cells are filled consistently with each role's described job
(docs/01 §2). Admin holds every permission.
"""

from __future__ import annotations

# (code, resource, action, description)
PERMISSIONS: list[tuple[str, str, str, str]] = [
    ("doc.read", "doc", "read", "View documents"),
    ("doc.create", "doc", "create", "Upload documents"),
    ("doc.update", "doc", "update", "Edit document metadata"),
    ("doc.delete", "doc", "delete", "Delete documents"),
    ("doc.reprocess", "doc", "reprocess", "Re-run the ingestion pipeline"),
    ("doc.export", "doc", "export", "Export document metadata"),
    ("equip.read", "equip", "read", "View equipment registry"),
    ("equip.manage", "equip", "manage", "Create/edit equipment"),
    ("wo.read", "wo", "read", "View work orders"),
    ("wo.create", "wo", "create", "Create work orders"),
    ("wo.assign", "wo", "assign", "Assign work orders"),
    ("wo.close", "wo", "close", "Close work orders"),
    ("wo.export", "wo", "export", "Export work orders"),
    ("maint.schedule", "maint", "schedule", "Manage maintenance schedules"),
    ("maint.predict.act", "maint", "predict.act", "Act on predictions (accept/dismiss)"),
    ("rca.run", "rca", "run", "Run root-cause analysis"),
    ("rca.publish", "rca", "publish", "Publish RCA results"),
    ("comp.read", "comp", "read", "View compliance data"),
    ("comp.map", "comp", "map", "Map regulations to procedures"),
    ("comp.gap.manage", "comp", "gap.manage", "Manage compliance gaps"),
    ("comp.evidence.generate", "comp", "evidence.generate", "Generate evidence packages"),
    ("qual.read", "qual", "read", "View quality records"),
    ("qual.manage", "qual", "manage", "Manage NCRs / CAPA"),
    ("lesson.read", "lesson", "read", "View lessons learned"),
    ("lesson.publish", "lesson", "publish", "Publish lessons learned"),
    ("copilot.use", "copilot", "use", "Use the AI copilot"),
    ("copilot.scope.all", "copilot", "scope.all", "Query across the full corpus scope"),
    ("graph.read", "graph", "read", "View the knowledge graph"),
    ("analytics.read", "analytics", "read", "View analytics / reports"),
    ("analytics.export", "analytics", "export", "Export analytics / reports"),
    ("notif.manage", "notif", "manage", "Broadcast / manage notifications"),
    ("user.manage", "user", "manage", "Manage users"),
    ("role.manage", "role", "manage", "Manage roles & permissions"),
    ("ai.config", "ai", "config", "Configure AI models"),
    ("flag.manage", "flag", "manage", "Manage feature flags"),
    ("audit.read", "audit", "read", "View the audit log"),
    ("tenant.manage", "tenant", "manage", "Manage tenant settings & lookups"),
]

ALL_PERMISSION_CODES: set[str] = {code for code, *_ in PERMISSIONS}

# (name, description, is_system)
SYSTEM_ROLES: list[tuple[str, str]] = [
    ("Admin", "Super admin — full control of the tenant"),
    ("Plant Manager", "Plant-wide operations, approvals, reporting"),
    ("Maintenance Engineer", "Work-order planning, RCA, schedules"),
    ("Field Technician", "Assigned work orders, close-out on the shop floor"),
    ("Compliance Officer", "Regulation mapping, gaps, evidence packages"),
    ("Quality Engineer", "NCRs, deviations, CAPA, quality trends"),
    ("Auditor", "Read-only audit trails & evidence"),
    ("Operator", "Shift procedures, equipment status, requests"),
]

# role name → set of permission codes ("*" expands to every permission).
ROLE_MATRIX: dict[str, set[str]] = {
    "Admin": ALL_PERMISSION_CODES,
    "Plant Manager": {
        "doc.read", "doc.create", "doc.update", "doc.delete", "doc.reprocess", "doc.export",
        "equip.read", "equip.manage",
        "wo.read", "wo.create", "wo.assign", "wo.close", "wo.export",
        "maint.schedule", "maint.predict.act", "rca.run", "rca.publish",
        "comp.read", "comp.gap.manage", "qual.read",
        "lesson.read", "lesson.publish",
        "copilot.use", "copilot.scope.all", "graph.read",
        "analytics.read", "analytics.export", "notif.manage", "audit.read",
    },
    "Maintenance Engineer": {
        "doc.read", "doc.create", "doc.update", "doc.reprocess", "doc.export",
        "equip.read", "equip.manage",
        "wo.read", "wo.create", "wo.assign", "wo.close", "wo.export",
        "maint.schedule", "maint.predict.act", "rca.run", "rca.publish",
        "comp.read", "lesson.read", "lesson.publish",
        "copilot.use", "graph.read", "analytics.read",
    },
    "Field Technician": {
        "doc.read", "doc.create", "equip.read", "wo.read", "wo.close",
        "lesson.read", "copilot.use", "graph.read",
    },
    "Compliance Officer": {
        "doc.read", "doc.create", "doc.update", "doc.export",
        "equip.read", "wo.read",
        "comp.read", "comp.map", "comp.gap.manage", "comp.evidence.generate",
        "qual.read", "lesson.read",
        "copilot.use", "copilot.scope.all", "graph.read",
        "analytics.read", "analytics.export", "audit.read",
    },
    "Quality Engineer": {
        "doc.read", "doc.create", "doc.update", "doc.export",
        "equip.read", "wo.read", "rca.run",
        "comp.read", "qual.read", "qual.manage",
        "lesson.read", "lesson.publish",
        "copilot.use", "graph.read", "analytics.read", "analytics.export", "audit.read",
    },
    "Auditor": {
        "doc.read", "doc.export", "equip.read", "wo.read",
        "comp.read", "qual.read", "lesson.read",
        "copilot.use", "graph.read", "analytics.read", "audit.read",
    },
    "Operator": {
        "doc.read", "doc.create", "equip.read", "wo.read", "wo.create",
        "lesson.read", "copilot.use", "graph.read",
    },
}


def permissions_for_role(role_name: str) -> set[str]:
    codes = ROLE_MATRIX.get(role_name, set())
    return set(ALL_PERMISSION_CODES) if codes is ALL_PERMISSION_CODES else set(codes)
