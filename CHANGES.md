# What's New — B18 + B19, AI providers, local-run cleanup

This document summarizes everything added or changed in this pass. For how to run
the app locally, see [README.md](README.md).

---

## 1. AI providers — Gemini & Grok added

`BACKEND/app/core/llm.py` now supports five providers behind one abstraction:
Anthropic, OpenAI, **Gemini**, **Grok**, and Ollama.

- **Grok** reuses the OpenAI client (xAI speaks the OpenAI chat-completions
  dialect) — only the API key and base URL differ (`GROK_BASE_URL`, default
  `https://api.x.ai/v1`).
- **Gemini** uses the `google-genai` SDK, hoisting the system prompt out-of-band
  and mapping the assistant turn to `model` as that API requires.
- **Every provider degrades to a deterministic mock when its key is absent**, so
  the app runs fully offline. The key-presence check is one shared helper
  (`provider_key_present`) — previously the copilot had a divergent copy that
  would have reported Gemini/Grok as "not configured".

Set the provider with `LLM_PROVIDER` and its key in `BACKEND/.env`. SDKs are an
optional extra (`pip install -e ".[ai]"`) — a stock install stays lean.

## 2. Local-run & dependency cleanup

- **Frontend dependencies: 382 → 221 packages** (~42% fewer; clean install ~1m20s).
  Removed `express`, `dotenv`, `@google/genai`, `react-grid-layout` (all unused);
  declared `@types/react`/`@types/react-dom` explicitly (they were only present
  transitively); dropped the duplicate `vite` and a dead `server.js` clean script.
- **Backend**: moved WeasyPrint + python-magic (native-lib dependencies that block
  a fresh `pip install`) into an optional `[native]` extra with working fallbacks;
  the Docker images now install the cairo/pango libs WeasyPrint actually needs
  (they were pip-installed but never functional before). Added `regex` and
  `qrcode` as real dependencies (see below).
- **`BACKEND/.env.example` now produces a working host boot** — it used
  Docker-internal hostnames (`postgres:5432`) that only resolve inside the compose
  network; now it targets `localhost:5433/6380` matching the compose override.
- **`FRONTEND/.env.example`** rewritten to document the three vars the app
  actually reads (was AI-Studio scaffold leftovers that would leak a key into the
  browser bundle).
- New root **[README.md](README.md)** — copy-paste local setup, verified end to end.

## 3. B18 — Extraction rules, API keys, webhooks, tours/changelog, seed-demo

Migration `0017_b18_integration`.

- **Extraction rules (S7)** — entity-extraction patterns are now tenant data, not
  code. `extraction_rules` table + `/admin/extraction-rules` CRUD + a `/test`
  endpoint that previews matches. The B6 worker was refactored to load rules from
  the DB (Redis-cached); **every hardcoded regex was deleted** (a test greps the
  module to prove it). Entities record which rule + version produced them.
  - Patterns run under a real wall-clock timeout via the `regex` package — stdlib
    `re` can't be interrupted and a catastrophic pattern would hang the process.
- **API keys (S8)** — `imk_live_` keys, SHA-256 stored, plaintext shown once.
  `X-API-Key` authenticates as an alternative principal with the key's scopes as
  permissions. CRUD under `/admin/api-keys`. Keys can't be granted unknown scopes
  or scopes the creator doesn't hold.
- **Webhooks (S8)** — `/admin/webhooks` endpoints + deliveries. Domain events fan
  out to subscribed endpoints, HMAC-SHA256 signed, retried on a 1m/5m/25m/2h/12h
  schedule (state on the delivery row, swept by a beat task), dead-lettering to
  `failed`. Manual retry + test-event endpoints.
- **Tours & changelog (S10)** — `GET /tours/{code}`, `GET /changelog`, admin CRUD;
  seeds the "main" 8-step product tour + 3 changelog entries.
- **Seed-demo (S10)** — `POST /admin/seed-demo` loads sample plant data
  idempotently (Postgres advisory lock guards concurrent runs; the seed only
  inserts what's missing), via a Celery task.

## 4. B19 — The final backend feature set

Migration `0018_b19_final` (one migration, all new tables).

- **Password reset (N1)** — real `password_reset_tokens` table (was Redis).
  Single-use, 30-min TTL, revokes all refresh tokens, emails a templated link.
- **i18n (S9)** — `locales` / `translations` / `translation_gaps`.
  `GET /i18n/{locale}/{ns}` with ETag + Redis cache, `en` fallback, and
  fire-and-forget gap logging. Admin CRUD + CSV import/export. Seeds `en` (8
  namespaces) + `hi` (nav/auth/copilot).
- **Sessions & security (S11)** — `/me/sessions`, revoke one, revoke-all-others,
  and `/me/change-password` (enforces the `auth.password_policy` setting, revokes
  other sessions, emails a notice).
- **Spare parts (S12)** — `parts` / `work_order_parts` / `part_movements`. Every
  stock change writes a signed ledger movement; **completing a work order consumes
  planned parts atomically and emits `part.low_stock`** when a part crosses its
  minimum. Parts are importable via the bulk importer. Seeds 10 parts incl.
  SEAL-40M tied to the P-101 story.
- **Shift logbook (S13)** — `shift_logs`. On submit, a log is registered as a
  document and pushed through the chunk→embed→entities pipeline (skipping
  OCR/parse), so **the Copilot can cite it**. `/summarize` produces an LLM
  handover. Seeds 6 logs incl. a pre-ingested P-101 vibration log.
- **Retention (S14)** — `retention_policies` + nightly beat. `archive` streams
  aged rows to gzip JSONL in object storage then deletes (fails closed if the
  archive can't be written); `delete` just deletes. Admin CRUD + run-now. Seeds
  defaults (disabled — opt-in per entity).
- **Equipment QR (N2)** — `GET /equipment/{id}/qr` (PNG), `by-code/{code}`
  (tenant-scoped), and an A4 label-sheet PDF via the export mechanism.
- **Audit viewer (N3)** — `/admin/audit-log` with filters + pagination + the
  before/after diffs that already existed on every row.
- **Bulk actions (N4)** — `POST /{work-orders,documents,notifications}/bulk` with
  per-row permission checks and partial-success reporting; actions validated
  against `bulk_actions_*` lookups.
- **Content pages (N5)** — `content_pages` + `/content/{slug}`; privacy/terms are
  public (served pre-login for the landing footer).

New RBAC permissions: `extraction_rules.manage`, `integrations.manage`,
`tours.manage`, `demo.seed`, `audit.view`, `parts.manage`, `logbook.write`,
`retention.manage`, `content.manage`, `translations.manage`.

## 5. Frontend ⇄ backend integration

The frontend and backend were originally built against different API designs, and
a stale client-side blacklist (`adapters.ts`) was throwing `NoBackendRouteError`
for paths *before any request was made* — even though B15–B19 had since built
those endpoints to the frontend's contract.

- **Removed the stale blacklist.** `/settings/effective`, `/saved-views`,
  `/me/*`, `/parts`, `/shift-logs`, `/tours`, `/changelog`, `/content`, `/i18n`,
  `/import/*`, `/exports`, and the whole `/admin/*` surface now reach the real
  backend. Only two genuinely-absent legacy paths still short-circuit.
- **Added `GET /navigation`** — a real, permission-filtered backend endpoint the
  sidebar depends on (it had no backend home, so the menu rendered empty in live
  mode).
- Verified the field shapes line up for the new modules (e.g. the parts screen
  reads `code`/`name`/`on_hand`/`min_stock` — exactly the backend's fields).

### Verified

A live end-to-end smoke replays every screen's primary fetch against the running
backend: **auth, navigation (16 permission-filtered items), and all 30 screen +
admin endpoints return 200**. The frontend typechecks and builds clean.

### Still using mocks (by design)

`VITE_API_MODE=mock` keeps the in-memory fixture server for UI-only development —
it's a useful fallback, not dead code, so it was left intact rather than deleted.

Two things were deliberately **not** switched to live, because doing so would make
the keyless demo *worse*:
- **Copilot streaming** (`stream.ts`) and **notification WebSocket** (`ws.ts`) are
  built and correct but not wired into their components. The copilot needs a real
  LLM key to answer; without one the backend returns empty results, so the local
  mock answers are more useful for a keyless walkthrough. Wire these once an LLM
  key is configured (`BACKEND/.env`).
- Four large hub screens (maintenance, knowledge-graph, equipment, compliance)
  read from component-local fixture arrays that predate the API layer. Wiring
  those to live data is the largest remaining frontend task and is tracked
  separately.

## 6. Bugs found & fixed along the way

- A rate-limiter test used a fixed Redis key with a 60s window — passed only on a
  cold Redis, failed on any re-run within the minute.
- `conftest` truncated a hand-maintained table list that had rotted; a new table
  leaked **454 orphaned rows across 65 dead tenants**. Now derived from model
  metadata so it can't drift.
- The B18 rule cache never populated: `LoadedRule` is a `slots` dataclass with no
  `__dict__`, so the Redis write silently failed on every load.
- The WeasyPrint dependency had never actually rendered in the Docker images (the
  native libs were missing); now installed correctly.

## 7. Tests

New: `test_llm_providers.py`, `test_b18_extraction_rules.py`,
`test_b18_integrations.py`, `test_b18_onboarding.py`, `test_b19_final.py`
(~90 new tests). The demo-critical loops — WO completion → stock math →
low-stock event, and shift-log submit → citable Copilot chunks — are verified
both by tests and by live end-to-end runs against the stack.
