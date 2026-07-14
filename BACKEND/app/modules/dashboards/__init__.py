"""Dashboards module (docs/02 §7, §21, §31).

`widget_registry` is the global catalog of widgets (key, type, data endpoint,
required permission). `dashboard_configs` hold the per-role default layout and
per-user personal overrides that `GET /dashboards/config` merges. Every widget's
numbers come from a real query in `widgets.py` (nothing hardcoded), cached in
Redis for 30–60 s.
"""
