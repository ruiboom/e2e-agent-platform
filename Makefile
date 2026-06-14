.PHONY: up down bootstrap infra-up infra-down infra-logs migrate router ground build-runtime eval optimise dev verify-m0 verify-all clean

# ── One-command launch / stop ──
# Launch the whole suite: infra + migrations + all services + console + seeds.
up:
	bash scripts/launch.sh

# Stop the host services (console + FastAPI). Docker infra stays up.
down:
	bash scripts/stop.sh

# One-shot install for both workspaces (pnpm + uv).
bootstrap:
	pnpm install
	uv sync --all-packages

# Bring up Postgres (pgvector) + the observability spine.
infra-up:
	docker compose -f infra/docker-compose.yml up -d

infra-down:
	docker compose -f infra/docker-compose.yml down

infra-logs:
	docker compose -f infra/docker-compose.yml logs -f

# Apply Postgres migrations (project, artifact, lineage, prompt registry, ...).
migrate:
	pnpm --filter @agent-platform/db migrate

# Run the model-router service (FastAPI) on :8789.
router:
	uv run uvicorn app.main:app --reload --app-dir services/model-router --port 8789

# Run the Ground service (canonical store + vector RAG) on :8790.
ground:
	uv run uvicorn app.main:app --reload --app-dir services/ground --port 8790

# Run the Build runtime (vector-RAG agent) on :8791.
build-runtime:
	uv run uvicorn app.main:app --reload --app-dir services/build-runtime --port 8791

# Run the Eval service (Judge node) on :8792.
eval:
	uv run uvicorn app.main:app --reload --app-dir services/eval --port 8792

# Run the Operate service (close the loop) on :8793.
optimise:
	uv run uvicorn app.main:app --reload --app-dir services/optimise --port 8793

# Run the Next.js console on :3000.
dev:
	pnpm --filter @agent-platform/console dev

# Run the Academy stack is part of the console; no separate process.

# Prove milestone M0 end-to-end.
verify-m0:
	bash scripts/verify-m0.sh

# Run every milestone verification (M0–M8).
verify-all:
	bash scripts/verify-all.sh

# Wipe all project/knowledge/graph data (keeps schema + router prompts).
reset-data:
	bash scripts/reset-data.sh

# Seed the single explorable example project (overdraft-assistant).
example:
	bash scripts/seed-example.sh
