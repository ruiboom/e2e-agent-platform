# Agent Platform — backbone (Phase 0)

The shared **spine** that will carry the 11-stage agent pipeline + Academy. This
repo is the *how*; the *what/why* lives in [`orginal-docs/`](orginal-docs/).

> **Status:** **M0 + M1 green.** The backbone is up and the golden thread runs
> end-to-end: scope → ground → build → deploy → evaluate, every step linked in
> the lineage and every answer carrying its provenance tuple. See the roadmap in
> `orginal-docs/02-build-sequence.md` (next: Phase 2 — front of funnel).

## Layout

```
apps/console/        Next.js (App Router) shell — projects, specify, chat, lineage/cost/feedback
services/
  model-router/      FastAPI — wraps LiteLLM + prompt/version registry; emits cost/latency
  ground/            FastAPI — canonical store + vector RAG (pgvector); pins kb_release
  build-runtime/     FastAPI — minimal vector-RAG agent; emits agent_version; chat + provenance
  eval/              FastAPI — Judge node over transcripts; emits eval_run
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
make dev                      # console       :3000

bash scripts/seed-phase1.sh   # seed specify / answer / judge prompts
make verify-m0                # prove M0 (backbone)
bash scripts/verify-m1.sh     # prove M1 (golden thread end-to-end)
```

## Tech decisions (locked — see `orginal-docs/00-architecture.md`)

- Next.js + Tailwind + shadcn/ui · Python 3.12 + FastAPI · Postgres 16 + pgvector
- Model access only through the **model-router** (wraps LiteLLM); every call
  emits tokens/cost/latency to cost-tracker.
- Auth is a **dev-stub** behind a single `getSession()` seam (`SESSION_PROVIDER`);
  real OIDC drops in later. RBAC reuses the KMS 7-role model.
- Artifact-lineage "golden thread": every stage emits a versioned, parent-linked
  artifact. Immutable append, enforced at the DB level.
