# ── IndusMind backend Makefile ───────────────────────────────────────────────
# Usage: make up | down | migrate | makemigration m="msg" | seed | test | logs | shell
COMPOSE ?= docker compose

.DEFAULT_GOAL := help
.PHONY: help up down build migrate makemigration seed test logs shell lint fmt rebuild-graph

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

up: ## Start the full stack (detached) and wait for health
	$(COMPOSE) up -d --build
	@echo "API → http://localhost:8000  ·  /healthz /readyz /docs"

down: ## Stop and remove containers (keeps volumes)
	$(COMPOSE) down

build: ## Build api + worker images
	$(COMPOSE) build

migrate: ## Apply all Alembic migrations (inside api container)
	$(COMPOSE) run --rm api alembic upgrade head

makemigration: ## Autogenerate a migration: make makemigration m="add x"
	$(COMPOSE) run --rm api alembic revision --autogenerate -m "$(m)"

seed: ## Seed baseline data (tenants, roles, permissions, lookups, prompts)
	$(COMPOSE) run --rm api python -m seeds.seed

test: ## Run the test suite against compose services
	$(COMPOSE) run --rm api pytest

lint: ## ruff + mypy
	$(COMPOSE) run --rm api sh -c "ruff check app tests && mypy app"

fmt: ## Auto-fix lint issues
	$(COMPOSE) run --rm api ruff check --fix app tests

logs: ## Tail logs (make logs s=api)
	$(COMPOSE) logs -f $(or $(s),api)

shell: ## Open a shell in the api container
	$(COMPOSE) run --rm api sh

rebuild-graph: ## Replay Postgres → Neo4j projection
	$(COMPOSE) run --rm api python -m seeds.rebuild_graph
