"""GET /navigation — permission-filtered sidebar for the caller."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.common.responses import success
from app.modules.auth.dependencies import CurrentUser, get_current_user

router = APIRouter(tags=["navigation"])

# (id, title, path, icon, required_permission | None). None = always visible.
# icon names match the frontend's lucide-react set.
NAV_ITEMS: list[tuple[str, str, str, str, str | None]] = [
    ("dashboard", "Dashboard", "/dashboard", "LayoutDashboard", None),
    ("copilot", "Expert Copilot", "/copilot", "Bot", "copilot.use"),
    ("documents", "Documents Library", "/documents", "FileText", "doc.read"),
    ("knowledge-graph", "Knowledge Graph", "/knowledge-graph", "Network", "graph.read"),
    ("equipment", "Equipment 360°", "/equipment", "Cpu", "equip.read"),
    ("maintenance", "Work Orders", "/maintenance", "Wrench", "wo.read"),
    ("parts", "Spare Parts", "/maintenance/parts", "Package", "equip.read"),
    ("compliance", "Compliance Hub", "/compliance", "ShieldCheck", "comp.read"),
    ("lessons-learned", "Lessons Learned", "/lessons-learned", "Compass", "lesson.read"),
    ("quality", "Quality Management", "/quality", "ShieldAlert", "qual.read"),
    ("logbook", "Shift Logbook", "/operations/logbook", "ClipboardList", "logbook.write"),
    ("notifications", "Notifications Center", "/notifications", "Bell", None),
    ("analytics", "Operational Analytics", "/analytics", "BarChart3", "analytics.read"),
    ("data", "Import / Export", "/data", "Database", "imports.run"),
    ("admin", "Admin", "/admin", "Settings", "user.manage"),
    ("audit-log", "Audit Logs", "/admin/audit-log", "History", "audit.view"),
]


@router.get("/navigation", summary="Sidebar navigation for the caller")
async def navigation(current: CurrentUser = Depends(get_current_user)) -> dict:
    """Only items whose required permission the caller holds (or that have none)."""
    perms = current.perms
    items = [
        {"id": nid, "title": title, "path": path, "icon": icon,
         **({"requiredPermission": perm} if perm else {})}
        for nid, title, path, icon, perm in NAV_ITEMS
        if perm is None or perm in perms
    ]
    return success(items)
