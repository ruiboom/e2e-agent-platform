# Agent Platform — Documentation

The Agent Platform takes an idea from **0 → a running, self-improving live agent**,
with every step traceable in a versioned lineage. This folder is the reference
documentation for the system as built (milestones **M0–M8**, all green).

> The original build plan (the *why*) lives in [`../orginal-docs/`](../orginal-docs/).
> This folder is the *what* and the *how-to-use*.

## Read in this order

| Doc | What it covers |
|---|---|
| [**User guide**](USER-GUIDE.md) | **Start here** — a click-through of the whole workflow using the seeded `overdraft-assistant` example. |
| [01 · System overview](01-overview.md) | What the platform is, the looped pipeline, core concepts (golden thread, provenance, gates). |
| [02 · Architecture](02-architecture.md) | Layers, monorepo, services + ports, tech stack, model router, governance, observability. |
| [03 · Data model & lineage](03-data-model.md) | Every table, every artifact type + payload shape, the lineage DAG, the provenance tuple. |
| [04 · API reference](04-api-reference.md) | Every console route and service endpoint with request/response. |
| [05 · Operations](05-operations.md) | Boot sequence, env vars, ports, verification, troubleshooting. |
| [06 · Enterprise playbook](06-enterprise-playbook.md) | Operating model, controls, RACI, runbooks and the go-live hardening gate for **regulated organisations**. |
| [07 · Production hardening](07-hardening.md) | The built-and-verified production depth: audit chain, policy engine, Presidio PII, real embeddings, OIDC, DSAR. |

## Stage user guides

One guide per pipeline stage — purpose, how to use it (UI + API), the artifacts it
reads and writes, RBAC, and tips.

**Phase A — Shape & plan**
- [Discover](guides/01-discover.md) · [Define](guides/02-define.md) · [Specify](guides/03-specify.md) · [Architect](guides/04-architect.md) · [Plan + Gate 1](guides/05-plan.md)

**Phase B — Make**
- [Ground](guides/06-ground.md) · [Build](guides/07-build.md)

**Phase C — Prove**
- [Test](guides/08-test.md) · [Evaluate + Gate 2](guides/09-evaluate.md)

**Phase D — Run & improve**
- [Deploy](guides/10-deploy.md) · [Operate](guides/11-operate.md)

**Academy**
- [Academy enablement](guides/12-academy.md)

## Quick start

```bash
cp .env.example .env          # set ANTHROPIC_API_KEY
make bootstrap                # pnpm install + uv sync --all-packages
make infra-up                 # Postgres (pgvector) + cost/feedback
make migrate                  # create all tables
# each in its own shell:
make router ; make ground ; make build-runtime ; make eval ; make optimise ; make dev
for p in 1 2 4 5 7; do bash scripts/seed-phase$p.sh; done   # seed router prompts
make verify-all               # prove every milestone M0–M8
```

Then open **http://localhost:3000** and sign in as **Alice (admin)**.
