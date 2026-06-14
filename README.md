# Agent Platform — backbone (Phase 0)

The shared **spine** that will carry the 11-stage agent pipeline + Academy. This
repo is the *how*; the *what/why* lives in [`orginal-docs/`](orginal-docs/).

> **Status:** Phase 0 — foundations / walking skeleton. Building toward
> milestone **M0**: create a project → router answers a "hello" → cost + latency
> in the dashboard → RBAC blocks an unauthorised role. See the full plan in
> `orginal-docs/02-build-sequence.md`.

## Layout

```
apps/console/        Next.js (App Router) shell — projects, hello, lineage/cost/feedback
services/
  model-router/      FastAPI — wraps LiteLLM + prompt/version registry; emits cost/latency
  cost-tracker/      observability (copied seed; SQLite)
  feedback-tracker/  observability (copied seed; SQLite)
packages/            shared TS libs (design-system, lineage-client, *-client, feedback-widget)
py/                  shared Python libs (lineage, governance [stub], providers [stub])
db/                  Postgres migrations + runner
infra/               docker-compose (Postgres+pgvector) + the spine services
```

## Prerequisites

- Node ≥ 22, **pnpm** (`corepack enable pnpm` or `npm i -g pnpm`)
- **uv** (Python 3.12 workspace)
- Docker + Docker Compose

## Boot sequence

```bash
cp .env.example .env          # set ANTHROPIC_API_KEY
make bootstrap                # pnpm install + uv sync
make infra-up                 # Postgres (pgvector) + cost/feedback services
make migrate                  # create project/artifact/lineage/prompt tables
make router                   # model-router on :8789   (separate shell)
make dev                      # console on :3000         (separate shell)
make verify-m0                # prove M0 end-to-end
```

## Tech decisions (locked — see `orginal-docs/00-architecture.md`)

- Next.js + Tailwind + shadcn/ui · Python 3.12 + FastAPI · Postgres 16 + pgvector
- Model access only through the **model-router** (wraps LiteLLM); every call
  emits tokens/cost/latency to cost-tracker.
- Auth is a **dev-stub** behind a single `getSession()` seam (`SESSION_PROVIDER`);
  real OIDC drops in later. RBAC reuses the KMS 7-role model.
- Artifact-lineage "golden thread": every stage emits a versioned, parent-linked
  artifact. Immutable append, enforced at the DB level.
