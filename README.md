# IndusMind

AI-powered industrial knowledge intelligence platform. Ingests plant documents
(manuals, P&IDs, shift logs, compliance regs), extracts entities, and answers
engineers' questions with citations — plus equipment 360, predictive maintenance,
RCA, and compliance evidence packages.

- **Backend** — FastAPI + Postgres/pgvector + Redis + Neo4j + MinIO + Celery (`BACKEND/`)
- **Frontend** — Vite + React 19 + Tailwind v4 (`FRONTEND/`)

This README covers **running locally only**. For production/AWS see [`infra/`](infra/README.md).

---

## TL;DR

```bash
# 1. infra (Postgres, Redis, Neo4j, MinIO, Mailhog)
cd BACKEND && cp .env.example .env && docker compose up -d postgres redis neo4j minio minio-bootstrap mailhog

# 2. backend (host venv — much faster than building the Docker image)
python -m venv .venv && .venv/Scripts/pip install -e ".[dev]"   # Linux/macOS: .venv/bin/pip
.venv/Scripts/python -m alembic upgrade head
.venv/Scripts/python -m seeds.seed
.venv/Scripts/python -m uvicorn app.main:app --port 8000

# 3. frontend (new terminal)
cd FRONTEND && cp .env.example .env.local && npm install && npm run dev
```

Open <http://localhost:3000> and log in as `admin@indusmind.io` / `Demo@1234`.

---

## Prerequisites

| Need | Why |
|---|---|
| **Docker Desktop** | Runs the four datastores. Must be *running* before step 1 — `docker compose` fails with a "cannot find the file specified" pipe error if it isn't. |
| **Python 3.11** | The backend pins `>=3.11,<3.12`. 3.12+ will refuse to install. |
| **Node 20+** | Frontend build. |

No AI API key is required. Every LLM provider falls back to a deterministic
offline mock, so ingestion, search, CRUD, and the whole UI work without one.
Only the generative answers (Copilot, RCA, extraction hints) need a real key.

---

## 1. Infrastructure

```bash
cd BACKEND
cp .env.example .env
docker compose up -d postgres redis neo4j minio minio-bootstrap mailhog
docker compose ps          # all should be "healthy"
```

This starts **only the datastores**. The API and worker run on the host (below) —
that's the fast path. `docker compose up -d` with no arguments would additionally
build the `api`/`worker`/`beat` images, which compiles every wheel from source and
takes many minutes. You don't need it for local development.

| Service | Host port | Console / notes |
|---|---|---|
| Postgres (pgvector) | **5433** | `indusmind` / `indusmind` |
| Redis | **6380** | |
| Neo4j | 7687 (bolt), 7474 (http) | <http://localhost:7474> — `neo4j` / `indusmind-neo4j` |
| MinIO | 9000 (api), 9001 (console) | <http://localhost:9001> — `minioadmin` / `minioadmin` |
| Mailhog | 1025 (smtp), 8025 (web) | <http://localhost:8025> — catches all outbound email |

> **Why 5433/6380 and not 5432/6379?** `docker-compose.override.yml` remaps them
> because those default ports are commonly already taken on a dev machine (a
> native Postgres install, another project's Redis). The override applies
> automatically. If your ports are free and you'd rather use the defaults, delete
> the override and update `DATABASE_URL`/`REDIS_URL` in `.env` to match.

## 2. Backend

```bash
cd BACKEND
python -m venv .venv
.venv/Scripts/pip install -e ".[dev]"        # Linux/macOS: .venv/bin/pip
.venv/Scripts/python -m alembic upgrade head
.venv/Scripts/python -m seeds.seed
.venv/Scripts/python -m uvicorn app.main:app --port 8000
```

Verify:

```bash
curl localhost:8000/healthz   # {"status":"ok"}
curl localhost:8000/readyz    # postgres/redis/neo4j/minio all "ok"
```

API docs: <http://localhost:8000/docs>.

`seeds.seed` is idempotent and creates the demo tenant: 46 permissions, 8 roles,
5 users, 2 plants, 25 equipment, 30 work orders, 12 ingested documents, 2
regulations, 9 NCRs, dashboards and widgets.

### Demo users — all password `Demo@1234`

| Email | Role |
|---|---|
| `admin@indusmind.io` | Admin |
| `manager@indusmind.io` | Plant Manager |
| `engineer@indusmind.io` | Maintenance Engineer |
| `technician@indusmind.io` | Field Technician |
| `compliance@indusmind.io` | Compliance Officer |

### Background jobs (optional)

Document ingestion, exports, and scheduled reports run on Celery. The API works
without it — jobs simply queue and stay `pending`. To process them:

```bash
# terminal A — worker
.venv/Scripts/python -m celery -A app.workers.celery_app.celery worker --loglevel=INFO -Q ingestion,ai,notify,scheduled,default
# terminal B — scheduler (only needed for periodic jobs: retention, report schedules)
.venv/Scripts/python -m celery -A app.workers.celery_app.celery beat --loglevel=INFO
```

## 3. Frontend

```bash
cd FRONTEND
cp .env.example .env.local
npm install
npm run dev                   # http://localhost:3000
```

`.env.local` controls where the UI points:

```ini
VITE_API_MODE=live                                    # live | mock
VITE_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
VITE_WS_URL=ws://localhost:8000/ws
```

Set `VITE_API_MODE=mock` to run the UI with no backend at all (in-memory
fixtures). The backend's `CORS_ORIGINS` already allows `http://localhost:3000`.

---

## AI providers

All keys live in `BACKEND/.env` — **never** in the frontend, which would ship the
key to the browser. Set `LLM_PROVIDER` to pick one and supply its key:

| `LLM_PROVIDER` | Key | Notes |
|---|---|---|
| `anthropic` | `ANTHROPIC_API_KEY` | default |
| `openai` | `OPENAI_API_KEY` | |
| `gemini` | `GEMINI_API_KEY` | |
| `grok` | `GROK_API_KEY` | xAI; override `GROK_BASE_URL` if needed |
| `ollama` | — | self-hosted; set `OLLAMA_URL` |

The SDKs are **not** installed by default — that's what keeps a stock install
small. Install the one you need:

```bash
.venv/Scripts/pip install -e ".[ai]"     # anthropic + openai + google-genai
```

`grok` needs no SDK of its own: xAI speaks the OpenAI dialect, so the `openai`
client serves it. **With no key set, the provider falls back to a deterministic
mock** and the app runs fine — you just won't get real generated answers.

Per-tenant model choice, pricing, and prompts live in the `ai_model_configs` /
`prompt_templates` tables (admin UI under `#admin/ai-config`), so the `.env`
value is only the fallback.

## Optional extras

| Extra | Contents | When |
|---|---|---|
| `.[dev]` | pytest, ruff, mypy | development (recommended) |
| `.[ai]` | anthropic, openai, google-genai | using a real LLM |
| `.[native]` | weasyprint, python-magic | need pixel-exact branded PDFs / MIME sniffing. **Needs system libraries** (GTK/cairo/pango, libmagic) — skip locally; reports fall back to a ReportLab layout and MIME sniffing is skipped. The Docker images install these. |
| `.[ml]` | sentence-transformers, paddleocr | local embeddings / OCR instead of hosted |

## Tests

```bash
cd BACKEND
RATE_LIMIT_ENABLED=false PYTHONPATH="$PWD" .venv/Scripts/python -m pytest -q
```

Requires the infra from step 1 to be up (the suite uses real Postgres/Redis).
`RATE_LIMIT_ENABLED=false` stops the limiter from throttling test bursts.

> **The suite TRUNCATEs every table between tests, in the same database the app
> uses.** Running tests therefore wipes your seeded demo data — re-run
> `python -m seeds.seed` afterwards. Point `DATABASE_URL` at a separate database
> if you want to keep the two apart.

Frontend has no test runner; `npm run lint` is `tsc --noEmit`.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `open //./pipe/dockerDesktopLinuxEngine` | Docker Desktop isn't running. Start it and wait for the whale icon to settle. |
| `password authentication failed` / connection refused on 5432 | You have a native Postgres on 5432. The compose one is on **5433** — check `DATABASE_URL` in `.env`. |
| `/readyz` shows a store as not ok | That container isn't healthy yet — `docker compose ps`, then `docker compose logs <service>`. Neo4j takes longest. |
| Sidebar empty / admin screens error in live mode | Known: some frontend screens still point at endpoints that don't exist yet. Use `VITE_API_MODE=mock` for those, or see `FRONTEND/INTEGRATION_MISMATCH_REPORT.md`. |
| Copilot answers are empty `{}` | No AI key set — the mock provider is answering. See **AI providers**. |
| Uploads never leave `pending` | No Celery worker running. See **Background jobs**. |

## Repo layout

```
BACKEND/     FastAPI app, Alembic migrations, Celery workers, seeds, tests
FRONTEND/    Vite + React 19 SPA
DOCS/        Product/architecture docs + decision log
infra/       Terraform for AWS (production only — not needed locally)
```
