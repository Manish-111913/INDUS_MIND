# IndusMind — Supplement: Missed Modules & Logic (05)

> **How this fits:** This doc ADDS to 01/02 — nothing here replaces them. Each module below was absent or under-specified in the original pack. Every module keeps the core rule: **no hardcoded values — all options, formats, rules, templates, and configs come from the database via APIs.** Implementation prompts for everything here are in `06-SUPPLEMENT-PROMPTS.md` (Firebase P14–P17, Claude Code B15–B18).

**Priority legend:** 🔴 P0 = needed for a credible demo · 🟡 P1 = strong judge win, do if time · ⚪ P2 = mention on the architecture slide, build only if ahead of schedule.

---

## S1. Settings Service 🔴 (the anti-hardcoding backbone)

**Why it was a gap:** 01 §26/§27 said "₹ en-IN, dd MMM yyyy" — that IS a hardcoded value. Formats, units, timezone must resolve from a settings hierarchy.

**DB:**
```sql
settings_definitions (id, key UNIQUE, value_type ENUM(string,int,bool,json,enum), enum_options JSONB,
                      default_value JSONB, scope ENUM(system,tenant,plant,user), category, label, description, is_public BOOL)
settings_values (id, definition_id FK, scope, scope_id UUID NULL, value JSONB, updated_by, updated_at,
                 UNIQUE(definition_id, scope, scope_id))
```
Seed definitions (not code constants): `locale.currency` (INR), `locale.date_format` (dd MMM yyyy), `locale.timezone` (Asia/Kolkata), `units.system` (metric|imperial), `units.pressure` (bar|psi|kPa), `units.temperature` (C|F), `ai.default_confidence_threshold`, `ingestion.max_file_mb`, `retention.audit_log_days`, `branding.logo_url`, `branding.app_name`.

**Resolution order:** user → plant → tenant → system default. One endpoint does the merge:
- `GET /settings/effective` → flat `{key: value}` map for the caller (cache in Redis 5 min, bust on write).
- `GET/PUT /settings?scope=tenant&scope_id=…` (admin, permission `settings.manage`).

**Frontend:** a `SettingsProvider` fetches `/settings/effective` at app boot (after auth) into a Zustand `settingsStore`. **All** formatting goes through `lib/format.ts` helpers (`formatDate`, `formatCurrency`, `formatUnit(value, 'pressure')`) that read the store — components never format inline. Screens: `/settings` (user scope: locale, theme default, timezone) and `/admin/settings` (tabbed by category, form auto-generated from `settings_definitions` — value_type drives the input widget; enum → select from `enum_options`).

---

## S2. User Preferences & Saved Views 🔴

**Why it was a gap:** 01 §11 specs 12 tables but their column sets/filters would be hardcoded per screen with no persistence.

**DB:**
```sql
user_preferences (id, user_id, key, value JSONB, UNIQUE(user_id, key))   -- e.g. "table:work_orders" → {columns, sort, density}
saved_views (id, tenant_id, user_id, entity ENUM(work_orders,documents,equipment,failures,ncrs,…),
             name, filters JSONB, columns JSONB, sort JSONB, is_shared BOOL, is_default BOOL, created_at)
```
**APIs:** `GET/PUT /me/preferences/{key}` · `GET/POST/PATCH/DELETE /saved-views?entity=…` (shared views visible tenant-wide, editable by owner or `views.manage`).

**Frontend:** extend the shared `DataTable`: a "Views" dropdown (My views + Shared), "Save current view", star-as-default; column chooser and density persist via preferences with debounced writes; optimistic UI. Pinned dashboard tab also stored as preference `dashboard:pinned`.

---

## S3. Notification Templates, Channels & Preferences 🔴

**Why it was a gap:** 02 §20 had notification APIs but message text would end up hardcoded in event handlers.

**DB:**
```sql
notification_templates (id, tenant_id NULL=system, event_code, channel ENUM(in_app,email,webhook),
                        subject_tpl, body_tpl, locale, is_active, version)         -- Jinja2 variables e.g. {{work_order.code}}
notification_preferences (id, user_id, event_code, in_app BOOL, email BOOL, digest ENUM(instant,daily,off))
outbound_email_log (id, tenant_id, to_email, template_id, status, provider_msg_id, error, created_at)
```
**Flow:** domain event (§34) → notification worker → load template by (event_code, channel, locale from S1) → render → respect user preference → deliver. Email adapter interface: `MailProvider` with `smtp` (local MailHog container in compose) ↔ `ses` (prod) — same pattern as the LLM/OCR adapters. Daily digest = Celery beat job grouping unsent digest items.

**APIs:** `GET/PUT /me/notification-preferences` · admin `CRUD /admin/notification-templates` with a `POST …/preview` (renders with sample payload).

**Frontend:** `/settings/notifications` — matrix of event types × (In-app / Email / Digest) toggles, event list fetched from `/lookups?type=notification_events`. Admin template editor with live preview pane.

---

## S4. AI Feedback + AI Usage & Cost Metering 🟡 (judge magnet)

**Why it was a gap:** completely missing — yet "we measure answer quality and cost-per-answer" is a Technical Excellence + Business Impact double hit.

**DB:**
```sql
ai_feedback (id, tenant_id, message_id FK chat_messages, user_id, rating ENUM(up,down),
             reason_code FK lookups(type='ai_feedback_reason'), comment, created_at)
ai_usage (id, tenant_id, user_id, feature ENUM(copilot,rca,compliance_scan,lessons,entity_extract,embed),
          model_config_id FK, prompt_tokens INT, completion_tokens INT, cost_usd NUMERIC(10,6),
          latency_ms INT, cache_hit BOOL, created_at)
-- price per 1M tokens lives in ai_model_configs (add columns price_input_usd, price_output_usd) — NOT in code
```
Every LLM adapter call writes one `ai_usage` row (cost computed from the model config's DB prices).

**APIs:** `POST /chat/messages/{id}/feedback` · `GET /admin/ai-usage/summary?group_by=feature|model|day` · `GET /admin/ai-feedback?rating=down`.

**Frontend:** 👍/👎 on every Copilot answer (👎 opens reason select from lookups + optional comment); admin `/admin/ai-observability` screen: cost & token charts (Recharts), cache-hit rate, p95 latency, table of down-voted answers linking to the full chat for review. Feed 👎 items into the eval set (`evals/` from the master plan) — closes the quality loop.

---

## S5. Meter Readings / Condition Data 🟡 (predictions were starved)

**Why it was a gap:** 02 §18 predictions had **no input data source**. Predictions without readings = pure fiction in the demo.

**DB:**
```sql
meter_definitions (id, tenant_id, code, name, unit FK lookups(type='units'), reading_type ENUM(gauge,counter), normal_min NUMERIC, normal_max NUMERIC)
equipment_meters (id, equipment_id, meter_definition_id, UNIQUE(equipment_id, meter_definition_id))
meter_readings (id, equipment_meter_id, value NUMERIC, recorded_at TIMESTAMPTZ, source ENUM(manual,import,api), recorded_by NULL)
-- index (equipment_meter_id, recorded_at DESC)
```
**APIs:** CRUD for definitions (admin) · `POST /equipment/{id}/readings` (single, technician) · `POST /readings/import` (CSV, see S6) · `GET /equipment/{id}/readings?meter=…&from=…` (downsampled server-side for charts).

**Prediction hook:** the heuristic predictor (B10) reads last-N readings vs `normal_min/max` trend + failure history; thresholds come from `meter_definitions`, never constants. Seed script generates 90 days of synthetic vibration/temperature readings for P-101 trending toward failure — this makes the prediction demo *real*.

**Frontend:** Equipment 360° gains a "Condition" tab (multi-meter line chart, normal band shading, reading-entry drawer for technicians — works offline via the outbox from 01 §25).

---

## S6. Import / Export / Reporting Engine 🟡

**Why it was a gap:** no bulk data path in or out — judges always ask "how do I get my data in?"

**Import (DB-driven mappings, not hardcoded parsers):**
```sql
import_jobs (id, tenant_id, entity ENUM(equipment,readings,users,parts), file_key, status ENUM(validating,preview,applying,done,failed),
             mapping JSONB, total_rows, ok_rows, error_rows, error_report_key, created_by, created_at)
```
Flow: upload CSV/XLSX (presigned, same as documents) → Celery validates against the entity's Pydantic schema → returns preview (first 20 rows + per-column mapping guess) → user confirms/edits column mapping in UI → apply → downloadable error report CSV for rejected rows. `GET /import/templates/{entity}` streams a header-only CSV generated **from the schema**, not a static file.

**Export:** every `DataTable` gets `POST /exports {entity, filters, columns, format: csv|xlsx}` → Celery renders honoring the caller's saved view + S1 locale formats → notification with signed download URL. Small results (<2k rows) return synchronously.

**Reports:**
```sql
report_templates (id, tenant_id, code, name, description, query_def JSONB, layout JSONB, output ENUM(pdf,xlsx), is_active)
report_schedules (id, template_id, cron_expr, recipients JSONB, locale, is_active, last_run_at)
report_runs (id, template_id, status, file_key, params JSONB, created_at)
```
Seed one template: "Daily Plant Summary" (open WOs, new failures, ingestion stats, compliance gaps) rendered to PDF (WeasyPrint) and emailed via S3 templates. Cron editable in admin — stored in DB (consistent with 02 §36).

**Frontend:** import wizard (3 steps: upload → map columns → results), export button on all tables, `/admin/reports` (templates list, run-now, schedule editor, run history with downloads).

---

## S7. Extraction Rules Engine 🟡 (kills the last hidden hardcoding)

**Why it was a gap:** B6's entity extraction would bake equipment-tag regexes into Python — a direct violation of the dynamic rule, and every plant has different tag conventions.

**DB:**
```sql
extraction_rules (id, tenant_id, entity_type FK lookups(type='entity_types'), method ENUM(regex,keyword,llm),
                  pattern TEXT, llm_hint TEXT, priority INT, confidence NUMERIC, is_active BOOL, version INT)
```
Seed: `^[A-Z]{1,3}-\d{2,4}[A-Z]?$` for equipment tags, OISD/IEC/ISO patterns for standard refs, date/pressure/temperature patterns. The ingestion worker loads active rules per tenant (Redis-cached, busted on change); regex hits get rule confidence, then the LLM pass (prompt from `prompt_templates`) catches the rest. Rules are versioned; re-running ingestion with new rules creates new `extracted_entities` versions.

**APIs:** admin CRUD + `POST /admin/extraction-rules/test` `{rule, sample_text}` → matches preview.

**Frontend:** `/admin/extraction-rules` — table + editor drawer with a live "test against sample text" panel (highlights matches). This screen is a 30-second "everything is configurable" judge moment.

---

## S8. Webhooks & API Keys (Integration Layer) ⚪→🟡

**Why it was a gap:** Scalability rubric (15%) rewards an integration story (SAP/Maximo), but there was no machine-to-machine surface.

**DB:**
```sql
api_keys (id, tenant_id, name, key_prefix, key_hash, scopes JSONB, last_used_at, expires_at, is_active, created_by)
webhook_endpoints (id, tenant_id, url, secret, event_codes JSONB, is_active, created_at)
webhook_deliveries (id, endpoint_id, event_code, payload JSONB, status, attempts, response_code, next_retry_at, created_at)
```
API keys: `imk_live_<random>`; auth middleware accepts `X-API-Key` as an alternative principal with scoped permissions. Webhooks: domain events (§34) matching an endpoint's `event_codes` are queued; HMAC-SHA256 signature header `X-IndusMind-Signature`; retries with exponential backoff (max 5), dead-letter to `status=failed`.

**APIs/Frontend:** `/admin/integrations` — API keys (create shows secret once, revoke), webhook endpoints (URL, event picker from lookups, "send test event" button), deliveries log with payload viewer and manual retry. Demo line: "this is how SAP PM or Maximo would subscribe to failure events."

---

## S9. Backend i18n Service ⚪

**Why it was a gap:** 01 §27 planned frontend i18n but string bundles would be static JSON in the repo.

```sql
locales (code PK, name, is_active)     -- seed: en, hi
translations (id, locale FK, namespace, key, value, UNIQUE(locale, namespace, key))
```
`GET /i18n/{locale}/{namespace}` (ETag + Redis cache) consumed by `next-intl`-style provider; missing keys fall back to `en` and are logged to a `translation_gaps` table so admins see what's untranslated. Lookups already carry `label` — add optional `label_i18n JSONB` for translated option labels. Ship `en` complete; `hi` for the top nav + Copilot screen only (demo flourish, not full coverage).

---

## S10. Onboarding, Guided Demo Tour & Help 🟡 (pure UX-score points)

**Why it was a gap:** judges get 5 minutes; nothing guided them, and an empty tenant looked broken.

- **Tenant onboarding checklist** (dismissible card on dashboard, state in `user_preferences`): steps auto-detected via existing count endpoints — "Add equipment ✓ / Upload documents ✓ / Invite team ✗ / Ask Copilot ✗". Includes a **"Load sample plant data"** button → `POST /admin/seed-demo` (idempotent; runs the seed script for this tenant).
- **Guided tour**: driver.js product tour with steps **fetched from `GET /tours/{code}`** (`tours` + `tour_steps` tables — selector, title, body, order) — even the tour isn't hardcoded. Auto-offers on first login per role; relaunchable from the help menu.
- **Help menu** (top bar `?`): keyboard-shortcuts modal (shortcut registry in one `lib/shortcuts.ts`, rendered dynamically), "What's new" changelog drawer fed from `GET /changelog` (`changelog_entries` table), link to restart tour.

---

## S11. Sessions & Device Management ⚪

Refresh tokens already exist (02 §6); expose them: `GET /me/sessions` (device/UA, IP, last active, current flag) + `DELETE /me/sessions/{id}` + "sign out everywhere". Screen: `/settings/security` — sessions list + change-password form. Small, rounds out the security story.

## S12. Spare Parts (light) ⚪

```sql
parts (id, tenant_id, code, name, unit FK lookups, min_stock NUMERIC, on_hand NUMERIC)
work_order_parts (id, work_order_id, part_id, qty_planned, qty_used)
```
WO detail gains a Parts tab; low-stock triggers the notification event `part.low_stock`. No procurement/PO scope — say "ERP integration via S8 webhooks" if asked.

## S13. Shift Logbook & Handover ⚪ (innovation flourish — only if ahead)

Problem 8 lists operator logs as a knowledge source. `shift_logs (id, tenant_id, plant_id, shift FK lookups(type='shifts'), log_date, author_id, content, tags JSONB, status ENUM(draft,submitted))`. Submitted logs are auto-ingested into the same chunk/embed pipeline (source_type='shift_log') so the Copilot can answer "what happened on night shift last Tuesday?" — plus `POST /shift-logs/{id}/summarize` (LLM handover summary, prompt from `prompt_templates`). One screen: `/operations/logbook` (timeline + editor). Massive innovation-per-effort ratio if time allows.

## S14. Data Retention & Housekeeping ⚪

`retention_policies (id, tenant_id, entity, keep_days, action ENUM(archive,delete), is_active)` + nightly Celery job. Defaults seeded from `settings_definitions`. Mention on the architecture slide; implementation is one worker function.

---

## Consolidated additions summary

| # | Module | New tables | New API groups | New/changed screens | Priority |
|---|--------|-----------|----------------|--------------------|----------|
| S1 | Settings service | 2 | /settings | /settings, /admin/settings + format helpers everywhere | 🔴 |
| S2 | Preferences & saved views | 2 | /me/preferences, /saved-views | DataTable views UI | 🔴 |
| S3 | Notification templates/prefs | 3 | templates, /me/notification-preferences | /settings/notifications, admin templates | 🔴 |
| S4 | AI feedback + usage | 2 | feedback, /admin/ai-usage | 👍/👎, /admin/ai-observability | 🟡 |
| S5 | Meter readings | 3 | meters, readings | Equipment Condition tab | 🟡 |
| S6 | Import/export/reports | 4 | /import, /exports, reports | import wizard, export buttons, /admin/reports | 🟡 |
| S7 | Extraction rules | 1 | /admin/extraction-rules | rules admin + live tester | 🟡 |
| S8 | Webhooks & API keys | 3 | /admin/integrations | integrations admin | ⚪→🟡 |
| S9 | Backend i18n | 2(+1 col) | /i18n | language switcher | ⚪ |
| S10 | Onboarding/tour/help | 3 | /tours, /changelog, seed-demo | checklist, tour, help menu | 🟡 |
| S11 | Sessions | 0 (reuse) | /me/sessions | /settings/security | ⚪ |
| S12 | Spare parts | 2 | /parts | WO Parts tab | ⚪ |
| S13 | Shift logbook | 1 | /shift-logs | /operations/logbook | ⚪ |
| S14 | Retention | 1 | (admin CRUD) | — | ⚪ |

**Permission codes to append to the canonical set (01 §22):** `settings.manage`, `views.manage`, `notifications.templates.manage`, `ai.observability.view`, `readings.record`, `readings.manage`, `imports.run`, `exports.run`, `reports.manage`, `extraction.rules.manage`, `integrations.manage`, `logbook.write`, `parts.manage`.

**Build-order integration:** Firebase Studio → run **P14–P17** (in 06) after P12/P13. Claude Code → run **B15–B18** (in 06); B15 (settings+preferences) should actually run **right after B2** if you haven't started yet, otherwise anytime before B13 integration. Nothing here blocks the original P0–P13 / B0–B14 sequence.
