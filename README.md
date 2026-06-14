# Agent Platform

The shared **spine** carrying the 11-stage agent pipeline + Academy. This repo is
the *how*; the *what/why* lives in [`orginal-docs/`](orginal-docs/).

> 📚 **Full documentation:** [`docs/`](docs/) — [system overview](docs/01-overview.md) ·
> [architecture](docs/02-architecture.md) · [data model](docs/03-data-model.md) ·
> [API reference](docs/04-api-reference.md) · [operations](docs/05-operations.md) ·
> [a user guide for every stage](docs/README.md#stage-user-guides).

> **Status: M0–M8 all green.** The full 0 → live → improve loop runs end-to-end:
> Discover → Define → Specify → Architect → Plan (Gate 1) → Ground (governed,
> 6 retrieval modes) → Build (4 paradigms) → Test/Evaluate (Gate 2) → Deploy
> (targets/channels + guardrails) → Operate (live logs auto-improve the prompt,
> re-entering the pipeline). Academy provides per-stage enablement. Every answer
> carries its provenance tuple; every step is linked in the lineage.
> Prove it all: `make verify-all` (or `bash scripts/verify-m<N>.sh`).

## Layout

```
apps/console/        Next.js (App Router) shell — projects, specify, chat, lineage/cost/feedback
services/
  model-router/      FastAPI — wraps LiteLLM + prompt/version registry; emits cost/latency
  ground/            FastAPI — canonical store + vector RAG (pgvector); pins kb_release
  build-runtime/     FastAPI — minimal vector-RAG agent; emits agent_version; chat + provenance
  eval/              FastAPI — test-set gen + Judge + Gate 2; emits eval_run
  optimise/          FastAPI — operate loop: live logs -> improved system_prompt
  cost-tracker/      observability (copied seed; SQLite)
  feedback-tracker/  observability (copied seed; SQLite)
packages/            shared TS libs (design-system, lineage-client, *-client, feedback-widget)
py/                  shared Python libs (lineage, providers [embeddings], governance [stub])
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
make bootstrap                # pnpm install + uv sync --all-packages
make infra-up                 # Postgres (pgvector) + cost/feedback services
make migrate                  # create lineage / prompt / ground tables

# each in its own shell:
make router                   # model-router  :8789
make ground                   # ground        :8790
make build-runtime            # build runtime  :8791
make eval                     # eval          :8792
make optimise                 # operate loop  :8793
make dev                      # console       :3000

for p in 1 2 4 5 7; do bash scripts/seed-phase$p.sh; done   # seed router prompts
make verify-all               # prove every milestone M0–M8
```

## Tech decisions (locked — see `orginal-docs/00-architecture.md`)

- Next.js + Tailwind + shadcn/ui · Python 3.12 + FastAPI · Postgres 16 + pgvector
- Model access only through the **model-router** (wraps LiteLLM); every call
  emits tokens/cost/latency to cost-tracker.
- Auth is a **dev-stub** behind a single `getSession()` seam (`SESSION_PROVIDER`);
  real OIDC drops in later. RBAC reuses the KMS 7-role model.
- Artifact-lineage "golden thread": every stage emits a versioned, parent-linked
  artifact. Immutable append, enforced at the DB level.
