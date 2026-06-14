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
	uv run --package model-router uvicorn app.main:app --reload --port 8789

# Run the Next.js console on :3000.
dev:
	pnpm --filter @agent-platform/console dev

# Prove milestone M0 end-to-end.
verify-m0:
	bash scripts/verify-m0.sh
