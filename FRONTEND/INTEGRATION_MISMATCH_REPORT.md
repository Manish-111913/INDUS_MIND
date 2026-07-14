# Frontend ⇄ Backend Integration — Mismatch Report

_Generated for PROMPT B13. Ground truth: live `app.openapi()` from `BACKEND/app`
(187 operations across 135 paths) vs. every `api.*` call in `FRONTEND/src`._

## 0. Headline finding

The prompt assumes the frontend was built against the same documented contract as
the backend (`/docs/02 §13`) and that integration is a matter of "diff shapes,
adjust types/adapters." **It is not.** The two were built independently against
**different API designs**:

| | Reality |
|---|---|
| Frontend framework | **Vite + React 19** (`import.meta.env`, `VITE_*`) — **not Next.js**. So `NEXT_PUBLIC_*` / `.env.local` Next conventions don't apply; I used `VITE_*`. |
| Frontend data layer | A single 2,977-line `src/lib/api/client.ts` **mock server** (localStorage + hardcoded fixtures + simulated latency). Not per-resource modules. |
| Copilot streaming | Hardcoded `MOCK_ANSWERS` + a local typing simulator. No network. |
| Notifications | `notificationStore.simulateIncomingEvent()` — pure client-side. |
| Auth | Bearer access token **+ refresh token in localStorage**, refresh sent in the request **body**. |
| Backend auth | Access token + **httpOnly `refresh_token` cookie** (SameSite=Strict, path `/api/v1/auth`); refresh reads the **cookie**. Matches the prompt's step-1 intent. |

**Path overlap: 14 of 76 frontend call-sites resemble a backend route, and
several of those 14 are false positives** (query-string vs path-param, or matched
a same-prefix POST). The real, shape-compatible overlap after manual review is
smaller (see §2). The remaining ~62 call-sites hit endpoints the backend **does
not implement** (`/navigation`, `/parts`, `/shift-logs`, `/saved-views`,
`/me/*`, the entire `/admin/*` surface, `/import/*`, `/exports`, `/content/*`,
`/tours/main`, `/changelog`, …).

**Conclusion:** "killing the mocks" is a **per-module rewrite of the frontend data
layer against the real contract**, not a typing pass. This report is the roadmap.

---

## 1. Environment & CORS (prompt step 1)

- **Backend CORS is already correct.** `app/main.py` sets
  `allow_origins=["http://localhost:3000"]` (from `CORS_ORIGINS`),
  `allow_credentials=True`, `expose_headers=["X-Request-ID"]`. Frontend dev server
  runs on `:3000` (`vite --port=3000`). No backend change needed.
- **Created `FRONTEND/.env.local`** (Vite conventions):
  ```ini
  VITE_API_MODE=live                                   # live | mock
  VITE_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
  VITE_WS_URL=ws://localhost:8000/ws
  ```
- The API client now always sends `credentials: 'include'` so the httpOnly
  refresh cookie flows on `/auth/refresh`.

---

## 2. Path-level diff (frontend call-site → backend route)

Full machine-generated mapping lives alongside this report. Summary of the
**genuinely usable** overlaps and the **contract fixes** each needs:

| Frontend call | Backend route | Status / fix required |
|---|---|---|
| `POST /auth/login` | `POST /api/v1/auth/login` | ✅ wired. Shape fixed: `{access_token,expires_in,user}` + cookie (was `{token,refreshToken,user}`). |
| `GET /auth/me` | `GET /api/v1/auth/me` | ✅ wired via `mapMeToUser` adapter (see §3). |
| `POST /auth/forgot-password` / `reset-password` | same | ✅ compatible. |
| `POST /auth/register` | — **none** | ⚠️ Backend has no self-serve register. Now blocked in live mode with a clear error; accounts come from `POST /users/invite`. |
| `GET /documents` (+ query) | `GET /api/v1/documents` | ◑ path ok; **query params + item shape differ** (see §4). |
| `POST /documents/upload-url` | `POST /api/v1/documents/upload-url` | ◑ path ok; request/response shape unverified — needs field diff. |
| `GET /documents/${id}` | `GET /api/v1/documents/{document_id}` | ◑ path ok; shape diff (`DocumentFile` vs backend `DocumentRead`). |
| `POST /documents/bulk-action` | — none | ✗ no backend equivalent. |
| `GET /search?q=` / `GET /search/suggest?q=` | `GET /api/v1/search`, `/search/suggest` | ◑ path ok; response shape unverified. |
| `GET /lookups?type=X` | `GET /api/v1/lookups/{category}` | ✗ **false match.** FE uses `?type=`; backend uses **path param** `/lookups/{category}`. Adapter needed. |
| `GET /lookups/areas,plants,doc_types,statuses,tags` | `/api/v1/areas`, `/plants`, `/lookups/{category}` | ✗ FE invents flat lookup routes; backend splits into real resources. |
| `GET /me/sessions`, `DELETE /me/sessions/{id}` | `GET/DELETE /api/v1/auth/sessions{/id}` | ✗ renamed: `/me/sessions` → `/auth/sessions`. |
| `GET/PUT /me/notification-preferences` | `GET/PUT /api/v1/notifications/preferences` | ✗ renamed + shape diff. |
| `/me/password`, `/me/preferences` | — (users module) | ✗ no direct equivalent; map to `PATCH /users/{id}`. |
| `GET /parts`, `/parts/{id}` | — none | ✗ no parts module in backend. |
| `GET /navigation` | — none | ✗ FE builds nav from server; backend derives it from `/auth/me` permissions. Rebuild client-side. |
| `GET /saved-views` | `GET /api/v1/search/saved` | ✗ renamed + shape diff. |
| `GET /shift-logs`, `POST /shift-logs/123/summarize` | — none | ✗ no backend equivalent. |
| `GET /exports`, `/import/*` | — none / `equipment/import`, `documents` | ✗ no generic import/export module. |
| `POST /chat/messages/{id}/feedback` | `POST /api/v1/chat/messages/{id}/feedback` | ◑ path ok; the whole copilot is mock (see §5). |
| entire `/admin/*` (api-keys, webhooks, retention, translations, reports, extraction-rules, notification-templates, settings, ai-usage, seed-demo) | — **none** | ✗ ~19 admin call-sites; no backend admin surface exists. |
| `/content/{page}`, `/changelog`, `/tours/main` | — none | ✗ static/demo content; keep client-side or add endpoints. |
| `GET /equipment/{id}/meters`, `/readings` | `GET /api/v1/equipment/{id}/metrics` | ✗ renamed + shape diff. |

**Backend capabilities the frontend does NOT yet consume** (large surface, ready
to wire): equipment tree/summary/history, failures + RCA (`/ai/rca/*`),
maintenance predictions/schedules/work-orders, compliance regulations/clauses/
gaps/coverage/**evidence-packages**, quality NCRs, ingestion jobs, knowledge
graph, analytics KPIs/reports, dashboards config/widgets, audit-log, AI
insights/query. **The entire "demo path" (upload → pipeline → copilot → citation
→ equipment 360 → RCA → compliance gap → evidence package) exists on the backend
but is currently served by mocks on the frontend.**

---

## 3. Auth contract (fixed this pass)

| Concern | Frontend (was) | Backend (real) | Resolution |
|---|---|---|---|
| Login response | `{ token, refreshToken, user }` | `{ access_token, token_type, expires_in, user }` + Set-Cookie refresh | Store reads `access_token`; refresh no longer stored client-side. |
| Refresh | `POST /auth/refresh {refreshToken}` → `{token,refreshToken}` | `POST /auth/refresh` (cookie) → `{access_token,expires_in}`, rotates cookie | Client sends no body, `credentials:'include'`, reads `access_token`. |
| `/auth/me` | returns a flat `User` | `{ user(UserRead), roles[], permissions[], flags[] }` | New `mapMeToUser()` adapter. |
| `User.name` | `name` | `full_name` | mapped. |
| `User.role` (single) | `UserRole` union | `roles[]` (role-name strings) | `roles[0]` → primary role (defensive fallback). |
| `User.featureFlags` | `Record<string,boolean>` | `flags[] {key,enabled,role_scope,rollout_pct}` | folded to `{key: enabled}`. |
| `User.plant` | required string | none (tenant-scoped; `/plants` is a resource) | left `''`; wire `/plants` later. |
| Error envelope | `{error:{code,message,fieldErrors}}` | `{error:{code,message,field_errors,request_id}}` | tolerant read; **TODO** align `fieldErrors`→`field_errors` in `types.ts`. |
| Register | `POST /auth/register` | none | blocked in live mode. |

---

## 4. Documents / demo-critical shape diffs (not yet reconciled)

`DocumentFile` (frontend) vs backend document schema differ on field names
(`name` vs `filename`/`title`, `date` vs `created_at`, `fileSize` string vs bytes,
`extractedEntities` inline vs a separate `GET /documents/{id}/entities` call) and
the pipeline `status` enum. The **upload flow** also differs: backend is a
two-step **presigned upload** (`POST /documents/upload-url` → PUT to storage →
`POST /documents/{id}/confirm`), then ingestion progress arrives over WebSocket
(`ingestion.progress`), whereas the mock fakes status transitions locally. These
need a dedicated `documents` adapter — **not done this pass** (flagged for
prioritization).

---

## 5. Streaming (prompt step 3) — client helpers built

- **SSE (copilot):** backend streams `POST /chat/sessions/{id}/messages` as
  `text/event-stream` with frames `event: token|citation|done`. Native
  `EventSource` can't POST, so I added **`src/lib/api/stream.ts`**
  (`streamChatMessage()`, fetch + `ReadableStream` parser). **Not yet wired into
  `ExpertCopilot.tsx`** (which is a large mock component); wiring is gated to run
  only when `!USE_MOCK`.
- **WebSocket (notifications + ingestion/RCA/compliance progress):** single
  tenant channel at `${WS_URL}?token=<accessJWT>` multiplexing typed events. Added
  **`src/lib/api/ws.ts`** (`realtime` singleton: connect/subscribe/auto-reconnect
  with backoff). **Not yet wired into `notificationStore` / ingestion views.**
- Mock simulators remain intact behind `VITE_API_MODE=mock`.

---

## 6. What was changed vs. what remains

**Changed (compiles clean, `tsc --noEmit` = 0 errors):**
- `FRONTEND/.env.local` (new) — Vite live-mode config.
- `client.ts` — `API_MODE`/`USE_MOCK`/`WS_URL` exports; `credentials:'include'`;
  cookie-based `/auth/refresh`; `mapMeToUser()` adapter.
- `authStore.ts` — login via `access_token` + `/auth/me` hydration; live logout
  revoke; register blocked in live mode; dual-shape `checkSession`.
- `stream.ts` (new) — real SSE copilot streaming client.
- `ws.ts` (new) — real WebSocket realtime client.

**Remaining (needs prioritization + a running backend stack to verify):**
1. Per-module adapters for the ~62 divergent call-sites (documents, equipment,
   compliance/evidence, maintenance/RCA, search, lookups, sessions, notification
   prefs) — or add the missing backend endpoints where the frontend feature has
   no backend home (`/parts`, `/shift-logs`, `/admin/*`, `/saved-views`, nav).
2. Wire `stream.ts` into `ExpertCopilot` and `ws.ts` into `notificationStore` +
   ingestion progress UI.
3. Live verification: log in the 5 seeded users; force access-token expiry and
   confirm silent refresh; walk the full demo path.
4. Standing up the stack: backend needs Postgres+pgvector, Redis, Neo4j, MinIO
   (`docker-compose.yml`), migrations + seeds, and an LLM key for copilot/RCA.
