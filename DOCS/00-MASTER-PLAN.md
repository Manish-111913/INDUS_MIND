# IndusMind — Unified Asset & Operations Brain
## Master Plan & How To Use This Documentation Pack

**Hackathon:** ET Hackathon — Problem 8: AI for Industrial Knowledge Intelligence
**Product Name:** IndusMind (you can rename; keep it consistent everywhere)
**Positioning:** Enterprise-grade Industrial Knowledge Intelligence SaaS — the class of IBM Maximo, Siemens MindSphere, SAP Asset Manager, GE Digital APM.

---

## 1. What's in this pack (read in this order)

| File | What it is | When you use it |
|---|---|---|
| `00-MASTER-PLAN.md` | This file. Strategy, module order, local→prod plan, demo plan | Read first, refer always |
| `01-FRONTEND-DOCUMENTATION.md` | Complete frontend spec (all 30 sections you asked for) | Reference while building UI; attach to Firebase prompts |
| `02-BACKEND-DOCUMENTATION.md` | Complete backend spec (all 57 sections) | Reference + attach to Claude Code prompts |
| `03-FIREBASE-STUDIO-PROMPTS.md` | Copy-paste prompts for Firebase Studio, screen by screen, in order | Phase 1 — building UI |
| `04-BACKEND-CLAUDE-CODE-PROMPTS.md` | Copy-paste prompts for Claude Code / Copilot, module by module, in order | Phase 2 — building backend + wiring |

---

## 2. The gaps in your original plan — and how this pack fills them

You gave two strong prompt outlines. Here is what was **missing** and is now solved:

1. **No bridge between frontend and backend.** Firebase Studio will generate a UI with fake data. The pack defines a **single shared API contract** (`02-BACKEND-DOCUMENTATION.md §13`) and a **mock API layer** so the UI runs standalone on day 1 and swaps to the real backend with one env variable (`NEXT_PUBLIC_API_BASE_URL`). No screen rework later.
2. **No seed/demo data strategy.** A knowledge platform with an empty corpus demos as nothing. The backend prompts include a **seed script + sample industrial document pack** (P&ID PDFs, work orders, SOPs, inspection reports, OISD/Factory Act excerpts) so the graph, RAG, and dashboards are alive during judging.
3. **No local→production path.** Everything is designed to run with **one `docker-compose up`** locally (Postgres+pgvector, Neo4j, Redis, MinIO, API, worker) and the same containers deploy to AWS (ECS/EKS) with zero code changes — only env vars change.
4. **No AI evaluation story.** Judges score *entity extraction accuracy, answer quality, graph completeness, time-to-answer, compliance gap detection*. The backend includes an **eval endpoint + benchmark question set** and the UI shows **confidence scores + citations + time-to-answer** on every AI response.
5. **No scope control.** 30 frontend sections + 57 backend sections is a quarter of engineering work. The pack marks every feature **P0 (demo-critical) / P1 (strong-to-have) / P2 (documented, stubbed)** so you build in the right order and never miss the demo.
6. **No prompt hygiene for tools.** Firebase Studio and Claude Code both degrade with giant prompts. Prompts are chunked to ~1 screen / ~1 module each, with explicit "attach this file/section" instructions.
7. **No demo script.** Section 8 below gives the exact 5-minute judge demo flow that hits every judging criterion.

---

## 3. Final architecture decision (locked)

### Frontend
- **Next.js 14 (App Router) + TypeScript** — this is what Firebase Studio generates natively.
- **Tailwind CSS + shadcn/ui** components, **Recharts** for charts, **React Flow** for knowledge-graph viewer, **TanStack Query** (server state) + **Zustand** (UI state), **react-pdf** for document viewer.
- **API-only data**: every screen reads from `/api/v1/...` through a typed API client. Zero hardcoded data. During UI phase, a mock server (route handlers returning fixture JSON shaped exactly like the real API) serves the same contract.

### Backend — Modular Monolith (not microservices)
- **FastAPI (Python 3.11)** — one deployable, 10 internal modules with strict boundaries. Python because the entire AI pipeline (OCR, embeddings, LangGraph agents) is Python-native. Microservices are the wrong call for a hackathon and for v1 of any product (see `02 §2` for full justification — this is a judge-friendly answer, not a shortcut).
- **PostgreSQL 16 + pgvector** — system of record AND vector store (one DB, fewer moving parts; pgvector handles millions of chunks — plenty).
- **Neo4j Community (Docker)** — knowledge graph (equipment ↔ documents ↔ failures ↔ regulations ↔ people).
- **Redis** — cache + Celery broker + rate limiting + pub/sub for WebSockets.
- **Celery workers** — document ingestion pipeline, scheduled jobs, notification fan-out.
- **MinIO** locally / **S3** in prod — file storage (S3-compatible API, so identical code).
- **LLM layer**: provider-agnostic adapter. Local dev → Anthropic/OpenAI API (or Ollama offline fallback). Embeddings: `bge-large-en-v1.5` via sentence-transformers locally; switchable to hosted embeddings in prod by env var.
- **Agents**: LangGraph — Ingestion Agent, Copilot (RAG) Agent, Maintenance/RCA Agent, Compliance Agent, Lessons-Learned Agent.

### The 10 backend modules (build in this order)
1. `core` — config, DB, logging, errors, middleware
2. `auth` — JWT + refresh rotation, RBAC, permissions, multi-tenant
3. `users` — user/role/permission management, audit
4. `equipment` — asset registry, hierarchy, health
5. `documents` — upload, storage, metadata, versioning, viewer APIs
6. `ingestion` — OCR → parse → chunk → embed → entity extraction → graph (Celery pipeline)
7. `knowledge` — knowledge graph APIs, semantic + hybrid search
8. `ai` — RAG copilot, chat sessions, RCA agent, lessons-learned, prompt & model config registry
9. `maintenance` — work orders, schedules, failure records, predictive recommendations
10. `compliance` — regulations, rule mapping, gap detection, evidence packages, audits
Plus cross-cutting: `notifications` (WebSocket + in-app + email), `dashboards` (config-driven widget APIs), `analytics`.

---

## 4. Build phases & timeline

### Phase 0 — Setup (half day)
- Create Git repo (monorepo: `/frontend`, `/backend`, `/infra`, `/docs`, `/sample-data`).
- Drop this documentation pack into `/docs`.
- Install: Node 20, Python 3.11, Docker Desktop.

### Phase 1 — Frontend in Firebase Studio (2–3 days)
- Use `03-FIREBASE-STUDIO-PROMPTS.md` prompts P0→P12 **in order** (foundation prompt first — it sets design system, layout shell, mock API layer; every later prompt builds on it).
- Everything renders from the mock API layer. Verify each screen on mobile width too (field technician persona = judging UX points).
- Export/clone the project to your local repo under `/frontend`.

### Phase 2 — Backend with Claude Code (3–4 days)
- Use `04-BACKEND-CLAUDE-CODE-PROMPTS.md` prompts B0→B14 **in order** inside the repo (Claude Code sees the whole repo — that's the advantage; prompts tell you what to reference).
- B0 scaffolds docker-compose + FastAPI skeleton; each next prompt adds one module **with tests**.
- After B6 (ingestion) run the seed script — your corpus, graph, and dashboards come alive.

### Phase 3 — Integration (1 day)
- Flip `NEXT_PUBLIC_API_BASE_URL` from mock to `http://localhost:8000/api/v1`.
- Walk every screen; fix contract mismatches (should be near-zero because both sides were built from the same API doc).

### Phase 4 — Polish + Demo (1 day)
- Seed rich demo data, record demo video, rehearse the script in §8, prepare architecture diagram (described in `02 §3` — draw in Excalidraw/draw.io), build the deck.

### Phase 5 — Production (post-hackathon or bonus points)
- Same containers → AWS: ECS Fargate (or EKS), RDS Postgres, ElastiCache Redis, S3, Neo4j Aura, CloudFront + Amplify/Vercel for frontend, GitHub Actions CI/CD. Full details `02 §45–48, 56`.

---

## 5. Priority matrix (never lose the demo)

| Priority | Features |
|---|---|
| **P0 — demo dies without these** | Auth + RBAC (login as 3 roles), document upload → ingestion pipeline visible progress, Expert Copilot chat with citations + confidence + source links, knowledge graph viewer, equipment registry + 360° page, role-based dashboards (Plant Manager + Technician mobile), global semantic search, compliance gap list |
| **P1 — strong differentiators** | RCA agent on a failure record, predictive maintenance recommendations, compliance evidence package auto-generation (PDF export), lessons-learned proactive alerts, notifications (WebSocket bell), audit trail screen, eval/benchmark screen (time-to-answer metric) |
| **P2 — document + stub in UI** | i18n, offline PWA caching, feature flags UI, multi-tenant admin, email/push channels, advanced analytics builder |

---

## 6. Local development runbook (target state)

```bash
# terminal 1 — infra + backend
cd backend && docker compose up          # postgres, neo4j, redis, minio, api, worker
make migrate && make seed                 # schema + demo corpus + demo users

# terminal 2 — frontend
cd frontend && cp .env.example .env.local # points to http://localhost:8000/api/v1
npm run dev                               # http://localhost:3000
```
Demo users seeded: `admin@indusmind.io`, `manager@...`, `engineer@...`, `technician@...`, `compliance@...` (password `Demo@1234`).

---

## 7. Environment strategy

| Concern | Local | Production |
|---|---|---|
| DB | Postgres container | AWS RDS Postgres (Multi-AZ) |
| Vectors | pgvector | pgvector on RDS (same) |
| Graph | Neo4j container | Neo4j Aura |
| Files | MinIO | S3 + CloudFront |
| Queue | Redis container | ElastiCache |
| LLM | API key (or Ollama) | API key via Secrets Manager |
| OCR | Tesseract/PaddleOCR | AWS Textract (env-switch adapter) |
| Frontend | `npm run dev` | Vercel/Amplify |
| Secrets | `.env` | AWS Secrets Manager |

Everything switches by environment variables only — the adapter pattern in `core/` guarantees it.

---

## 8. The 5-minute judge demo script (maps to judging criteria)

1. **(0:00) The hook** — "Plants run 7–12 disconnected document systems; engineers lose 35% of their time searching. Watch us collapse that to seconds." *(Business Impact 25%)*
2. **(0:30) Ingest live** — drag a scanned P&ID + a work-order PDF into the ingestion screen; show the pipeline stages (OCR → entities → graph) completing in real time and the knowledge graph gaining nodes. *(Technical Excellence 20%, Innovation 25%)*
3. **(1:30) Expert Copilot on mobile view** — as a *Field Technician*, ask: "Pump P-101 is vibrating — what were the last 3 failures and the fix?" Answer arrives with **citations, confidence score, time-to-answer badge (e.g., 2.1s vs '~45 min traditional search')**, deep-links open the exact source page. *(UX 15%, Business Impact)*
4. **(2:45) RCA + predictive** — open the Maintenance Intelligence screen: RCA agent output on a failure, next-failure risk score, auto-suggested schedule change. *(Innovation)*
5. **(3:30) Compliance** — Compliance Officer view: OISD/Factory Act rules mapped to procedures, 3 gaps flagged, click **"Generate audit evidence package"** → PDF downloads. *(Business Impact)*
6. **(4:15) Scale story** — one architecture slide: modular monolith → same containers on EKS, multi-tenant, pgvector→dedicated vector DB path, event-driven pipeline. *(Scalability 15%)*
7. **(4:45) Close** — "Every screen you saw is API-driven and configurable — zero hardcoded data. This is a product, not a demo."

---

## 9. Rules to hold yourself to while building

- **One source of truth for the API contract** (`02 §13`). If you change a response shape, change the doc, then both sides.
- **Never hardcode**: dashboards read widget configs from `/dashboards/config`, permissions from `/auth/me/permissions`, dropdown options from `/lookups/*`.
- **Commit after every prompt** — Firebase Studio and Claude Code both occasionally regress; git is your undo.
- **Test the mobile viewport weekly** — 15% of scoring is UX and the brief explicitly calls out mobile field technicians.
- **Keep a `DECISIONS.md`** — judges love seeing engineering judgment.
