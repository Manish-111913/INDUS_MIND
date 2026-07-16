# IndusMind — Complete Testing Guide

End-to-end testing guide for the IndusMind platform (FastAPI backend + Vite/React 19 frontend).
Covers prerequisites, test data, environment setup, per-module manual test flows, real-time
feature tests, automated smoke/e2e scripts, RBAC expectations, and troubleshooting.

---

## 1. Requirements

| Component | Requirement | Notes |
|-----------|-------------|-------|
| **Docker Desktop** | running | Serves Postgres, Redis, Neo4j, MinIO via `BACKEND/docker-compose.yml` (+ `docker-compose.override.yml` for remapped ports). |
| **Python** | 3.12, `.venv` present in `BACKEND/` | Deps pre-installed. Runs the API on the host (faster than the Docker image build). |
| **Node.js** | ≥ 20 (tested on 22/23) | Runs the Vite dev server and the optional Playwright e2e scripts. |
| **Ports** | 8000 (API), 3000/3001 (frontend), 5433 (PG), 6380 (Redis), 7687 (Neo4j), 9000 (MinIO) | See §8 for the port-conflict workarounds on this machine. |

> This machine's host `:5432` and `:6379` are shadowed by other services, so compose remaps
> Postgres → **5433** and Redis → **6380** (via `docker-compose.override.yml`). Host `:3000` is
> held by a separate **INVEXIS** app, so the Vite dev server falls back to **:3001**.

---

## 2. Test Data

The seed script (`BACKEND/seeds/seed.py`) provisions one tenant with the full RBAC matrix, global
lookups, demo feature flags, and the data below.

### 2.1 Demo users (password for **all**: `Demo@1234`)

| Email | Name | Role | Can test |
|-------|------|------|----------|
| `admin@indusmind.io` | Aditi Admin | **Admin** | Everything, incl. `/users`, admin suite, broadcasts. |
| `manager@indusmind.io` | Rajesh Manager | **Plant Manager** | Dashboards, all read surfaces, approvals. |
| `engineer@indusmind.io` | Priya Engineer | **Maintenance Engineer** | Maintenance, equipment, predictions, RCA. |
| `technician@indusmind.io` | Arun Technician | **Field Technician** | Work orders, logbook, least-privilege views. |
| `compliance@indusmind.io` | Meena Compliance | **Compliance Officer** | Compliance hub, evidence, audits. |

> **Use `admin@indusmind.io` for the fullest test run** — it has every permission (e.g. `/users`,
> which non-admins get a *by-design* 403 on; see §7).

### 2.2 Seed data counts (live backend)

| Entity | Count | Notable identifiers |
|--------|-------|---------------------|
| Equipment | **25** | `P-101`, `P-102` (Crude Feed Pumps), plus compressors/exchangers/vessels |
| Work orders | **30** | `WO-2001`, `WO-2002`, … (corrective/preventive/predictive) |
| Failure records | **8** | e.g. P-101 seal leak, high-vibration trip |
| Predictions | **7** | risk-ranked predictive-maintenance list |
| Maintenance schedules (PM) | **5** | |
| Documents | **13** | P&IDs, OEM manuals, shift logs, incident reports (ingested + chunked) |
| Regulations | **2** | `OISD-STD-118`, `FACTORY-ACT-1948` |
| Compliance gaps | **2** | |
| Compliance audits | **0** | *(intentionally empty — good for testing the empty state / create flow)* |
| Knowledge graph | **67 nodes / 70 edges** | labels: Equipment, Document, Clause, Parameter, Person, Area |
| Notifications | **1** (grows via broadcast/events) | |

### 2.3 Handy copilot test prompts (return real cited answers, keyless)
- `What failures occurred on pump P-101?`
- `Torque spec for valve V-230 bonnet bolts`
- `Which OISD-118 clauses apply to tank farm TF-2?`

---

## 3. Environment Setup

Run from `BACKEND/` in a **bash** shell (Git Bash). PowerShell equivalents noted where they differ.

### 3.1 Start infrastructure (Docker)
```bash
cd BACKEND
docker compose up -d postgres redis neo4j minio      # override remaps PG→5433, Redis→6380
docker ps                                            # all 4 should be "healthy"
```

### 3.2 Migrate + seed the database
```bash
PYTHONPATH="$PWD" .venv/Scripts/python.exe -m alembic upgrade head
PYTHONPATH="$PWD" .venv/Scripts/python.exe -m seeds.seed     # 5 users + all demo data
```
> Re-running the seed is idempotent for roles/users; it will top up demo data.

### 3.3 Start the backend API
```bash
PYTHONPATH="$PWD" .venv/Scripts/python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Health checks (should both be `ok`, all 4 stores green):
```bash
curl -s http://localhost:8000/healthz          # {"status":"ok"}
curl -s http://localhost:8000/readyz           # {"status":"ok","checks":{"postgres":"ok",...}}
```
OpenAPI docs: <http://localhost:8000/docs> · raw spec: `/openapi.json`

### 3.4 Start the frontend

`FRONTEND/.env.local` controls the mode:
```
VITE_API_MODE=live                                         # live | mock
VITE_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
VITE_WS_URL=ws://localhost:8000/ws
```
```bash
cd FRONTEND
npm install         # first time only
npm run dev         # serves on :3000, or :3001 if 3000 is taken
```
Open the URL Vite prints (e.g. <http://localhost:3001>).

> **CORS:** the backend allows the frontend origin via `BACKEND/.env` `CORS_ORIGINS`. If Vite lands
> on **:3001**, ensure `.env` contains `CORS_ORIGINS=http://localhost:3000,http://localhost:3001`
> and **restart the backend**, or CORS will block API calls.

---

## 4. Two Test Modes

| Mode | `VITE_API_MODE` | Backend needed? | Purpose |
|------|-----------------|------------------|---------|
| **Live** | `live` | Yes | Real end-to-end integration test (this guide's focus). |
| **Mock** | `mock` | No | Fully offline demo — fixtures + localStorage. Every screen still works; copilot/notifications use local simulators. |

Switch by editing `.env.local` and restarting `npm run dev`. Both modes must work; the mock demo
is the offline fallback and should never regress.

---

## 5. Manual Test Flows (Live mode)

Log in at `#login`. After login you land on `#dashboard`. Navigate via the sidebar or the URL hash.

### 5.1 Authentication
1. Log in with each of the 5 demo users → confirm the sidebar/nav differs by role (permission-filtered).
2. Log out → the WebSocket disconnects and you return to `#login`.
3. Refresh while logged in → session is restored via the httpOnly refresh cookie (`POST /auth/refresh`).

### 5.2 Copilot (`#copilot`) — **SSE streaming**
1. Type `What failures occurred on pump P-101?` and send.
2. **Expect:** the answer streams in token-by-token, then citations (real documents) and a confidence
   badge (~High/0.82) appear. This is `POST /chat/sessions/{id}/messages` streaming SSE.
3. Click 👍 / 👎 → feedback posts to the real message UUID (`/chat/messages/{id}/feedback`).
4. Create a new session, rename, pin, delete → all persist.

> Keyless backend uses an **extractive retrieval** fallback — answers are real and cited, not empty.
> Add an LLM key in `BACKEND/.env` (e.g. `ANTHROPIC_API_KEY`) for generative answers.

### 5.3 Notifications (`#notifications`) — **WebSocket push**
1. Keep the app open (any screen). As **admin**, trigger a broadcast (§6.3) or let an event fire.
2. **Expect:** a toast appears and the bell badge increments in real time — no refresh. Delivered over
   `/ws` as a `notification.new` frame.
3. Mark one / mark all read → persists to the backend (`POST /notifications/mark-read`).

### 5.4 Maintenance hub (`#maintenance`)
- **Work Orders** tab → list shows `WO-2001…` with status/priority/SLA. Open one → checklist, parts,
  and AI-context lazy-load. Transition status / assign / close → persists (`PATCH`/`POST /work-orders`).
- **Failures** tab → 8 records; open one for the RCA workspace.
- **Predictions** tab → 7 risk-ranked items; accept/dismiss persists.
- **PM Scheduling** tab → 5 schedules.
- **Spare Parts** & **Shift Logbook** tabs were already live (`/parts`, `/shift-logs`).
- **Expect (live):** real rows, no console errors. *(Non-admin roles: assignee dropdown falls back to
  a fixture roster because `/users` needs `user.manage` — see §7.)*

### 5.5 Equipment 360 (`#equipment`)
- Left tree shows the plant → area → equipment hierarchy (`/equipment/tree`).
- Registry list shows all 25 assets (`P-101`, `P-102`, …). Select one → detail tabs populate from
  `/equipment/{id}/summary`, `/metrics`, `/history`.
- **Condition** tab plots live meter readings (`/equipment/{id}/meters`, `/readings`) and lets you post a reading.
- QR label export → `/equipment/labels`.
- **Expect:** health scores, specs, and event timeline render; empty sub-panels (e.g. relationships)
  render gracefully where the backend has no data yet.

### 5.6 Compliance hub (`#compliance`)
- **Regulations** → `OISD-STD-118`, `FACTORY-ACT-1948`; expand one to lazy-load its clause tree.
- **Gaps** → 2 gaps; open one for side-by-side detail. Change status (Risk Accepted / Closed) → PATCH
  persists; "Remediating" spawns a real work order (`/gaps/{id}/create-remediation`).
- **Audits** → empty list (create one to test the POST flow).
- **Evidence Packages** → generate one (`POST /compliance/evidence-packages`).
- Overview heatmap sources from `/compliance/coverage`.

### 5.7 Knowledge Graph (`#knowledge-graph`)
- Stats strip shows **67 nodes / 70 edges** by type (`/graph/stats`).
- Canvas seeds an initial cluster; **search** (`/graph/search?q=P-101`) suggests nodes; clicking a node
  expands neighbors (`/graph/nodes/{id}`). Reset re-seeds.
- **Expect:** nodes/edges render on the ReactFlow canvas; the drawer shows a node's properties verbatim.

### 5.8 Other live screens
- **Documents** (`#documents`) → 13 docs with filters, detail, bulk actions.
- **Analytics** (`#analytics`), **Quality** (`#quality`), **Lessons** (`#lessons-learned`), **Admin**
  (`#admin`, admin only) → load their respective backend data.

---

## 6. Backend API Smoke (curl)

```bash
# 6.1 Login → capture a token (bash)
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@indusmind.io","password":"Demo@1234"}' \
  | python -c "import sys,json;print(json.load(sys.stdin)['data']['access_token'])")

# 6.2 Hit every hub endpoint (all should be 200)
for p in /work-orders /failures /maintenance/predictions /maintenance/schedules \
         /maintenance/metrics /compliance/regulations /compliance/gaps /compliance/audits \
         /equipment /equipment/tree /graph/stats /notifications /documents; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" \
    "http://localhost:8000/api/v1$p")
  echo "$code  $p"
done

# 6.3 Broadcast a notification (drives the WS test in §5.3 / §7 e2e)
curl -s -X POST http://localhost:8000/api/v1/notifications/broadcast \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"category":"safety_alert","priority":"critical","title":"TEST","body":"hello"}'

# 6.4 Copilot SSE (watch token/citation/done frames)
SID=$(curl -s -X POST http://localhost:8000/api/v1/chat/sessions \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"probe"}' | python -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")
curl -N -X POST "http://localhost:8000/api/v1/chat/sessions/$SID/messages" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" -d '{"content":"What failures occurred on pump P-101?"}'
```

---

## 7. Automated E2E Verification (optional, Playwright)

Reproduces the full-integration checks used to validate this build. Playwright is **not** a project
dependency — install it only when running e2e:

```bash
cd FRONTEND
npm i -D playwright && npx playwright install chromium
```

Create `FRONTEND/e2e-smoke.mjs` (drives every module, asserts no uncaught errors + all API 2xx):

```js
import { chromium } from 'playwright';
const BASE = 'http://localhost:3001';               // match your Vite port
const API = 'http://localhost:8000';
const ROUTES = ['dashboard','maintenance','equipment','knowledge-graph','compliance',
  'copilot','notifications','documents','analytics','quality','lessons-learned'];
const errs = [], bad = []; let route = 'login';
const b = await chromium.launch({ headless: true });
const p = await (await b.newContext()).newPage();
p.on('pageerror', e => errs.push([route, String(e).slice(0,200)]));
p.on('response', r => { if (r.url().startsWith(API) && r.status() >= 400)
  bad.push([route, r.status(), r.url().replace(API,'')]); });
await p.goto(`${BASE}/#login`); await p.waitForSelector('input[type=email]');
await p.fill('input[type=email]','admin@indusmind.io');
await p.fill('input[type=password]','Demo@1234');
await p.click('button[type=submit]');
await p.waitForFunction(() => !location.hash.includes('login')).catch(()=>{});
await p.waitForTimeout(2500);
for (route of ROUTES) { await p.goto(`${BASE}/#${route}`); await p.waitForTimeout(3500);
  console.log(`#${route}: len=${(await p.evaluate(()=>document.body.innerText.length))}`); }
console.log('\nUNCAUGHT ERRORS:', errs.length ? errs : '(none)');
console.log('BAD API (excl. /users 403 for non-admin):', bad.length ? bad : '(none)');
await b.close();
```
```bash
node e2e-smoke.mjs      # expect: 0 uncaught errors, 0 bad API calls
```

WebSocket end-to-end (`FRONTEND/e2e-ws.mjs`, Node ≥ 20 has native `WebSocket`):
```js
const API = 'http://127.0.0.1:8000';                // use 127.0.0.1, not localhost (IPv6)
const t = (await (await fetch(`${API}/api/v1/auth/login`, {method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({email:'admin@indusmind.io',password:'Demo@1234'})})).json()).data.access_token;
const ws = new WebSocket(`ws://127.0.0.1:8000/ws?token=${encodeURIComponent(t)}`);
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); console.log('WS', m.type);
  if (m.type === 'connected') fetch(`${API}/api/v1/notifications/broadcast`, {method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},
    body:JSON.stringify({category:'safety_alert',priority:'critical',title:'WS TEST',body:'x'})});
  if (m.type === 'notification.new') { console.log('PUSH RECEIVED ✓'); ws.close(); process.exit(0); }});
setTimeout(() => { console.log('TIMEOUT ✗'); process.exit(1); }, 12000);
```
```bash
node e2e-ws.mjs         # expect: WS connected → PUSH RECEIVED ✓
```

> Clean up (`rm FRONTEND/e2e-*.mjs && npm uninstall playwright`) to keep the repo pristine.

---

## 8. Backend Automated Tests (pytest)

```bash
cd BACKEND
# Requires a reachable Postgres (compose PG on :5433) and rate limiting disabled.
RATE_LIMIT_ENABLED=false PYTHONPATH="$PWD" .venv/Scripts/python.exe -m pytest -q
# Target a module (tests are flat files, e.g. test_maintenance.py, test_compliance.py,
# test_equipment.py, test_knowledge.py, test_ai.py, test_auth.py, test_authz_matrix.py):
RATE_LIMIT_ENABLED=false PYTHONPATH="$PWD" .venv/Scripts/python.exe -m pytest tests/test_maintenance.py -q
```
> The full suite (~20 min) seeds data per test. There is a known **order-dependent flake**
> (`rate_limiter`, `rca`) that passes in isolation — run those files individually to confirm.

Frontend static checks:
```bash
cd FRONTEND
npm run lint        # tsc --noEmit (type check)
npm run build       # production build must succeed
```

---

## 9. RBAC / Expected "Non-Bugs"

- **`GET /users` → 403 for non-admin roles** is **by design** (`user.manage` permission). The
  Maintenance hub falls back to a fixture assignee roster; work orders still function. Test the full
  assignee flow as **admin**.
- The `#login` screen makes a few `401`/`i18n` calls **before** auth completes — expected, harmless.
- Empty sub-panels (e.g. equipment relationships, compliance audits) render gracefully where the seed
  set has no data yet.

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Frontend API calls fail with CORS error | Vite on :3001 but backend CORS only allows :3000 | Add `http://localhost:3001` to `BACKEND/.env` `CORS_ORIGINS`, restart backend. |
| `ECONNREFUSED ::1:8000` in a Node script | `localhost` resolved to IPv6; API binds IPv4 | Use `http://127.0.0.1:8000`. |
| `/readyz` shows a store not ok | A container isn't up/healthy | `docker compose up -d postgres redis neo4j minio`; wait for healthy. |
| Copilot answers are generic/extractive | No LLM key configured | Add a provider key to `BACKEND/.env` (e.g. `ANTHROPIC_API_KEY`). Extractive answers are still valid + cited. |
| Port 5432/6379 conflicts | Native PG / another Redis on host | Already handled by `docker-compose.override.yml` (PG→5433, Redis→6380). |
| Vite says "Port 3000 is in use" | INVEXIS app holds :3000 | Vite auto-uses :3001; update CORS accordingly. |
| Blank sidebar in live mode | Not authenticated / nav permission mismatch | Log in; nav is permission-filtered via `GET /navigation`. |

---

## 11. Quick Start (TL;DR)

```bash
# 1. Infra + backend
cd BACKEND
docker compose up -d postgres redis neo4j minio
PYTHONPATH="$PWD" .venv/Scripts/python.exe -m alembic upgrade head
PYTHONPATH="$PWD" .venv/Scripts/python.exe -m seeds.seed
PYTHONPATH="$PWD" .venv/Scripts/python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# 2. Frontend (new terminal) — ensure .env.local has VITE_API_MODE=live
cd FRONTEND && npm install && npm run dev

# 3. Open the printed URL, log in as admin@indusmind.io / Demo@1234, walk §5.
```
