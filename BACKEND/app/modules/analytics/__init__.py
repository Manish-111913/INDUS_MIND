"""Analytics module (docs/02 §7, §22).

Config-driven reports: `report_definitions` hold admin/seed-authored, whitelisted
parameterised SQL (SELECT-only, bound params, always tenant-scoped). Run returns
``{columns, rows, charts}``; export renders xlsx/pdf to S3; `scheduled_reports`
drives the beat that emails reports on a cron.
"""
