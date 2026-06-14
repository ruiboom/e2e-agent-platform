# 05 · Operations

## Prerequisites

- **Node ≥ 22** + **pnpm** (`npm i -g pnpm` or corepack)
- **uv** (Python 3.12 workspace manager)
- **Docker** + Docker Compose
- An **`ANTHROPIC_API_KEY`** (the only required secret)

## First-time setup

```bash
cp .env.example .env                 # set ANTHROPIC_API_KEY
make bootstrap                       # pnpm install + uv sync --all-packages
make infra-up                        # Postgres (pgvector) + cost/feedback (Docker)
make migrate                         # apply db/migrations/0001…0012
```

The console also reads `apps/console/.env.local` (copy from
`apps/console/.env.example`) — Next.js loads env from the app directory, not the
repo root.

## Run it

Each in its own shell:

```bash
make router          # model-router   :8789
make ground          # ground         :8790
make build-runtime   # build runtime  :8791
make eval            # eval           :8792
make optimise        # operate loop   :8793
make dev             # console        :3000
```

Then seed the router prompts (idempotent):

```bash
for p in 1 2 4 5 7; do bash scripts/seed-phase$p.sh; done
```

Open **http://localhost:3000**, sign in as **Alice (admin)**.

## Environment variables

| Var | Used by | Default |
|---|---|---|
| `DATABASE_URL` | all | `postgresql://postgres:postgres@localhost:5433/agent_platform` |
| `ANTHROPIC_API_KEY` | model-router | — (required) |
| `MODEL_ROUTER_DEFAULT_MODEL` | model-router | `claude-haiku-4-5` |
| `MODEL_ROUTER_URL` / `GROUND_URL` / `BUILD_RUNTIME_URL` / `EVAL_URL` / `OPTIMISE_URL` | services + console | `http://localhost:879{0..3}` |
| `COST_TRACKER_URL` / `FEEDBACK_TRACKER_URL` | model-router / console | `:8787` / `:8788` |
| `NEXT_PUBLIC_COST_TRACKER_URL` / `NEXT_PUBLIC_FEEDBACK_TRACKER_URL` | console (browser) | `:8787` / `:8788` |
| `SESSION_PROVIDER` / `SESSION_SECRET` | console auth | `dev-stub` / `dev-only-change-me` |

## Verification

Each milestone has a self-contained script that drives a fresh project end-to-end
and asserts the result. They require the services + console to be running.

```bash
make verify-m0          # backbone: project + router + cost + RBAC
bash scripts/verify-m1.sh   # golden thread + provenance
# … verify-m2 … verify-m8 …
make verify-all         # all of M0–M8 in sequence (68 assertions)
```

What each proves:

| Script | Proves |
|---|---|
| `verify-m0` | create project persists → router answers → cost/latency in dashboard → RBAC blocks viewer |
| `verify-m1` | scope→ground→build→deploy→eval, 7 lineage edges, provenance tuple |
| `verify-m2` | Discover→…→Plan, Gate 1 blocks until sign-off |
| `verify-m3` | governed ingest (web/docs/RSS, four-eyes), all 6 retrieval modes, hybrid agent |
| `verify-m4` | same spec built 4 ways, each passes chat + eval |
| `verify-m5` | multi-persona suite, quality/latency/cost, Gate 2 blocks/passes |
| `verify-m6` | 2 targets × 3 channels, guardrails (injection blocked, PII redacted) |
| `verify-m7` | live logs → improved system_prompt version → loop closed |
| `verify-m8` | 11 stages have live help, role path completes |

## Authentication & roles

Dev-stub identities (the `/login` page lists them):

| User | Role | Can |
|---|---|---|
| **alice** | `admin` | everything |
| **carol** | `contributor` | create projects, write artifacts |
| **bob** | `viewer` | read only |

Capability map (`apps/console/lib/rbac.ts`): `project:create` and `artifact:write`
→ contributor/steward/admin; `artifact:approve` → approver/steward/admin/
compliance_approver; `prompt:activate` → admin. Real OIDC replaces only
`getSession()` (`SESSION_PROVIDER=oidc`); the RBAC map is unchanged.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `role "postgres" does not exist` on 5432 | A host Postgres shadows the container. The platform uses **5433** on purpose. |
| `Cannot find module './123.js'` from the console | A `next build` ran while `next dev` was running and corrupted `.next`. **Fix:** kill dev, `rm -rf apps/console/.next`, restart `make dev`. Never run a production build against a live dev server. |
| `uv sync` installed almost nothing | Use `uv sync --all-packages` (workspace members aren't installed by a plain sync). |
| pnpm refuses a dep build script (`esbuild`/`sharp`) | Allow-listed in `pnpm-workspace.yaml` under `allowBuilds`. |
| Router `/v1/route` → 502 "model call failed" | `ANTHROPIC_API_KEY` missing/invalid in `.env`. |
| Deploy → `409 blocked by Gate 2` | Run an eval first and ensure the project's `pre_deploy_gates` pass (`POST /v1/policy`). |
| Ground retrieval returns nothing | The revisions weren't **approved** (four-eyes) before the release, or the query has no overlap. |
| `$(curl …)` fails in the sandbox | A harness quirk, not the platform — run verify scripts in a normal shell. |

## Resetting state

```bash
make infra-down                      # stop containers (keeps volumes)
docker volume rm agent-platform_pgdata   # wipe Postgres (then re-migrate)
```
