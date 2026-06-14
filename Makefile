.PHONY: bootstrap infra-up infra-down infra-logs migrate router dev verify-m0 clean

# One-shot install for both workspaces (pnpm + uv).
bootstrap:
	pnpm install
	uv sync

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

# Run the Next.js console on :3000.
dev:
	pnpm --filter @agent-platform/console dev

# Prove milestone M0 end-to-end.
verify-m0:
	bash scripts/verify-m0.sh
