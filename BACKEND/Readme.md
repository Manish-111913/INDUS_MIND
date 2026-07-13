# IndusMind — Backend

Modular monolith (FastAPI · Python 3.11 · async SQLAlchemy 2 + Alembic · Pydantic v2)
backed by PostgreSQL 16 (+pgvector), Neo4j 5, Redis 7, MinIO/S3 and Celery.
Full spec: [`../DOCS/02-BACKEND-DOCUMENTATION.md`](../DOCS/02-BACKEND-DOCUMENTATION.md).
The REST contract (§13 envelope) is the source of truth the frontend mock layer mirrors.

## Quickstart (local)

```bash
cp .env.example .env      # adjust if needed; dev JWT keypair auto-generates
make up                   # postgres, neo4j, redis, minio(+bucket), mailhog, api, worker, beat
make migrate              # apply Alembic migrations (enables pgcrypto/vector/pg_trgm)
make seed                 # baseline data (fills in as modules land)
```

Verify:

```bash
curl -s http://localhost:8000/healthz   # {"status":"ok"}
curl -s http://localhost:8000/readyz    # checks postgres, redis, neo4j, minio
curl -s http://localhost:8000/api/v1/   # {"data":{"api":"indusmind","version":"v1"}}
open http://localhost:8000/docs         # OpenAPI — the frontend contract
```

Tests: `make test`.

## Layout (docs/02 §4)

```
app/
  main.py                 # app, middleware, exception handlers, /healthz /readyz
  api/v1/router.py        # mounts every module router under /api/v1
  core/                   # config, database, redis, storage, events, llm, ocr,
                          # security, logging, exceptions, middleware, deps
  common/                 # Base + mixins, pagination, base repository, envelopes
  modules/                # per-module: router/service/repository/schemas/models/events
  workers/                # celery_app + tasks/
  ws/                     # websocket channels
alembic/                  # migrations (async engine)
seeds/  evals/  tests/
```

Every business table carries: UUID pk, `tenant_id`, `created_at/updated_at/created_by/updated_by`,
`deleted_at` (soft delete), `version` (optimistic lock) — via the mixins in `app/common`.
Nothing behavioural is hardcoded: dropdowns → `lookups`, prompts → `prompt_templates`,
model choice → `ai_model_configs`, dashboards → `dashboard_configs`, permissions → DB.
