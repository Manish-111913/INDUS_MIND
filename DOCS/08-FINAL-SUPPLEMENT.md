# IndusMind — Final Supplement: Remaining Modules, Complete (08)

> This closes out everything that was previously marked ⚪ "slide material" — **S9 i18n, S11 sessions, S12 spare parts, S13 shift logbook, S14 retention** — as full implementations, plus **five NEW items** found in a final sweep that no earlier doc covered: password reset flow, equipment QR codes & scanning, audit log viewer, bulk table actions, and legal/error pages. Nothing remains deferred after this doc. Prompts: **P18** (Firebase Studio) and **B19** (Claude Code) below. Zero-hardcoding rule applies throughout.

---

## Part 1 — Final sweep: NEW items no earlier doc covered

### N1. Password reset & forgot-password flow 🔴 (was a real hole in auth)
B1 built login/refresh/logout but no recovery path — a judge clicking "Forgot password?" would hit a dead end.
```sql
password_reset_tokens (id, user_id, token_hash, expires_at, used_at NULL, created_at)  -- 30-min TTL, single-use
```
APIs: `POST /auth/forgot-password {email}` (always returns 200 to prevent user enumeration; sends email via S3 template `auth.password_reset`) · `POST /auth/reset-password {token, new_password}` (validates hash+TTL+unused, revokes all refresh tokens on success). Frontend: `/forgot-password` (email form → "check your inbox" state) and `/reset-password?token=` (new password + strength meter from settings key `auth.password_policy`, success → login). Add "Forgot password?" link on `/login`.

### N2. Equipment QR codes & mobile scanning 🟡 (industrial-authentic demo winner)
Real plants label assets. Technician points phone at a pump's QR → lands on its Equipment 360°.
- Backend: `GET /equipment/{id}/qr` (PNG QR via `qrcode` lib encoding `{APP_URL}/eq/{code}` — APP_URL from settings) · `POST /equipment/labels {ids[]}` → printable A4 PDF label sheet (WeasyPrint: QR + tag in mono + name), delivered like an export. `GET /equipment/by-code/{code}` resolves tag → id (tenant-scoped).
- Frontend: "QR / Print labels" action on equipment table (multi-select) and detail header; public-ish route `/eq/[code]` (requires login, then redirects to the 360° page); `/scan` route on mobile using the camera via `html5-qrcode` — a scan icon in the technician bottom-tab bar.
- Demo beat: print P-101's label beforehand, scan it live on your phone.

### N3. Audit log viewer 🟡 (the table existed; no one could see it)
`GET /admin/audit-log?actor=&entity=&action=&from=&to=` (cursor pagination over the append-only table). Screen `/admin/audit-log` (permission `audit.view`): filterable DataTable (timestamp, actor, action, entity type+id link, IP) + row expand showing the before/after JSON diff. Compliance judges love this; it's nearly free since the data already exists.

### N4. Bulk actions on tables 🟡
Multi-select checkboxes on Work Orders (bulk assign / change status / export selected), Documents (bulk tag / re-ingest / delete), Notifications (mark all read). Backend: `POST /{resource}/bulk {action, ids[], params}` validating per-row permissions, returns per-id results `{ok:[], failed:[{id,reason}]}` — partial success is normal, UI shows a result toast with a "view failures" link. Available actions per resource come from `GET /lookups?type=bulk_actions_{resource}` — not hardcoded in the frontend.

### N5. Legal & system pages ⚪ (5-minute polish)
`/privacy` and `/terms` rendering markdown fetched from `GET /content/{slug}` (`content_pages` table — even legal text isn't hardcoded), linked in the landing footer and login page. Custom `not-found.tsx` and `error.tsx` (global + per-segment) with brand illustration, "Go to dashboard" action, and request-ID display on 500s so users can report errors meaningfully.

---

## Part 2 — Full specs for the formerly-deferred modules

### S9. Internationalization (complete spec)
```sql
locales (code PK, name, native_name, is_active, is_default BOOL)          -- seed: en (default), hi
translations (id, locale FK, namespace, key, value, UNIQUE(locale, namespace, key))
translation_gaps (id, locale, namespace, key, first_seen_at, hits INT)    -- auto-logged misses
```
- `GET /i18n/{locale}/{namespace}` → `{key: value}` (ETag + Redis 10-min cache; bust on write). Namespaces: `common`, `nav`, `auth`, `copilot`, `maintenance`, `compliance`, `admin`, `errors`.
- Fallback chain: requested locale → `en`; every miss upserts `translation_gaps` (fire-and-forget).
- Lookups gain `label_i18n JSONB` (`{"hi": "…"}`); the lookups endpoint resolves labels using the caller's locale (from S1 settings key `locale.language`, user-scope).
- Admin: `/admin/translations` — locale/namespace picker, editable key-value table, "Gaps" tab listing missing keys with one-click "add translation", `POST /admin/translations/import` (CSV) and export.
- Frontend: `t(key)` hook backed by a namespace-lazy loader; language switcher in the top-bar user menu writes the user setting and refetches bundles. Ship `en` complete + `hi` for nav/auth/copilot (demo flourish). **Rule: no user-facing literal strings in JSX — everything through `t()`; enforce with an ESLint rule (`react/jsx-no-literals` scoped to `app/` and `components/`).**

### S11. Sessions & security (complete spec)
- `GET /me/sessions` → active refresh-token family rows: device (parsed UA), IP, created, last_used, `is_current`. `DELETE /me/sessions/{id}` revokes a family; `POST /me/sessions/revoke-all-others`.
- `POST /me/change-password {current, new}` — verifies current, enforces `auth.password_policy` from settings, revokes all other sessions, sends `auth.password_changed` notification.
- Screen `/settings/security`: sessions table with device icons + "Sign out" per row + "Sign out everywhere else" button (confirm dialog), change-password form with policy checklist that ticks live, and (display-only) "Two-factor authentication — coming soon" row driven by feature flag `auth.mfa` so the roadmap is visible in-product.

### S12. Spare parts (complete spec)
```sql
parts (id, tenant_id, code, name, description, unit FK lookups(type='units'), min_stock NUMERIC, on_hand NUMERIC, location, is_active)
work_order_parts (id, work_order_id, part_id, qty_planned NUMERIC, qty_used NUMERIC NULL, UNIQUE(work_order_id, part_id))
part_movements (id, part_id, delta NUMERIC, reason ENUM(wo_consume,adjustment,receipt), ref_id NULL, created_by, created_at)
```
- APIs: parts CRUD (`parts.manage`), `GET /parts?low_stock=true`, WO endpoints `POST/PATCH/DELETE /work-orders/{id}/parts`. Completing a WO writes `qty_used` movements and decrements `on_hand` atomically; crossing below `min_stock` emits event `part.low_stock` (template exists from B18). Part codes importable via S6 importer (register entity=parts).
- Frontend: `/maintenance/parts` (table + low-stock filter chip + editor drawer + stock-adjust dialog with reason), WO detail "Parts" tab (add planned parts via searchable select, record used qty on completion), low-stock KPI widget registered in `widget_registry` for the manager dashboard. Seed 10 parts incl. "Mechanical seal 40mm — SEAL-40M" tied to the P-101 story.

### S13. Shift logbook & handover (complete spec — the innovation flourish)
```sql
shift_logs (id, tenant_id, plant_id, shift FK lookups(type='shifts'), log_date DATE, author_id,
            content TEXT, tags JSONB, status ENUM(draft,submitted), submitted_at NULL,
            ai_summary TEXT NULL, document_id NULL FK,     -- link to its ingested representation
            UNIQUE(tenant_id, plant_id, shift, log_date, author_id))
```
- On submit: the log is registered as a document (`source_type='shift_log'`) and pushed through the **existing** chunk→embed pipeline (skip OCR/parse), so the Copilot can answer "what happened on night shift last Tuesday?" with a citation to the log. Entity extraction runs too — equipment tags mentioned in logs auto-link to Equipment 360° timelines.
- `POST /shift-logs/{id}/summarize` → LLM handover summary (prompt `shift_handover` in `prompt_templates`), stored in `ai_summary`, metered in `ai_usage` (feature=`logbook`).
- APIs: CRUD (`logbook.write` for own drafts; submitted logs immutable, edits create an amendment note), `GET /shift-logs?plant=&from=&shift=`.
- Frontend: `/operations/logbook` — left: date/shift/plant filter rail + timeline of log cards (author, shift chip, tag chips, AI-summary teaser); right: editor (rich textarea, tag input, equipment-tag autocomplete that inserts mono chips, Save draft / Submit). "Generate handover summary" button on submitted logs streams the summary in. Operator role's default landing adds a "Start today's log" quick action.
- Demo beat: submit a log mentioning P-101 vibration → ask Copilot about last night → it cites the log you just wrote. *Knowledge captured at the source.*

### S14. Retention & housekeeping (complete spec)
```sql
retention_policies (id, tenant_id, entity ENUM(audit_log,notifications,chat_sessions,ingestion_jobs,webhook_deliveries,ai_usage,report_runs),
                    keep_days INT, action ENUM(archive,delete), is_active, last_run_at, last_affected INT)
```
Nightly Celery beat job per active policy: `archive` copies rows to a compressed JSONL in object storage (`retention/{entity}/{date}.jsonl.gz`) then deletes; `delete` just deletes; both write an audit-log entry. Defaults seeded from `settings_definitions` (`retention.*_days`). Admin: `/admin/retention` — policy table (entity, keep days editable, action select, active toggle, last run + affected count) + "Run now" per row. One sentence for judges: "data lifecycle is governed, not accidental."

---