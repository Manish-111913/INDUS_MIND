"""Bulk table actions (docs/08 N4).

`POST /{resource}/bulk {action, ids[], params}` — one transaction per row group,
per-row permission check, partial success reported as {ok:[], failed:[{id,reason}]}.
Available actions come from `lookups.bulk_actions_{resource}`, never hardcoded in
the frontend.
"""
