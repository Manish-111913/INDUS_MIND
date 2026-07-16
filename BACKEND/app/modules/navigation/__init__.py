"""Server-driven navigation (frontend contract).

The sidebar is built from `GET /navigation`, filtered to the items the caller's
permissions allow. Kept server-side so a new module/permission changes the menu
without a frontend deploy — the same anti-hardcoding rule the rest of the app
follows. The catalog is data (`NAV_ITEMS`), not scattered through the UI.
"""
