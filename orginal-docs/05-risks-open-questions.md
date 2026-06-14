# 05 · Risks & open questions

Read before each phase. **Risks** are things that can derail the build; **open questions** are decisions still needed (with a recommendation and the phase by which it must be answered).

## Top risks

| # | Risk | Why it bites | Mitigation |
|---|---|---|---|
| R1 | **Tech consolidation cost** — sources span Next.js, FastAPI, Flask, Gradio, Svelte, Vue, Electron, Express | Porting many UIs into one console is real work and easy to under-estimate | Port view-layers only (logic stays in backends); do it lazily per phase, not upfront; keep KMS (Node) and hermes (Electron) as-is behind the service mesh |
| R2 | **Generative agent builder quality** (N8) | An agent that looks right but misbehaves erodes trust in the whole platform | Sequence last; generate config for existing runtimes (not free code); never auto-promote without passing Gate 2; diff vs a hand-built baseline |
| R3 | **KMS depth is the kernel** — if Ground is shaky, everything downstream is | The platform is only as good as its single source of truth | Phase 3 is a hard dependency for Build; invest in governance + conflict/dedup + releases before breadth |
| R4 | **Lineage discipline erodes** | If stages stop linking artifacts, "traceability/rollback" silently dies | Make `parents[]` required at write time; CI check that each stage's output links its input; render the DAG so gaps are visible |
| R5 | **Deploy-target sprawl** | 8 targets × many channels = endless surface | Ship 2 targets first (Vercel + GCP); treat the rest as adapters added on demand |
| R6 | **Governance scope creep** (banking-grade) | OPA + four-eyes + PII + risk across every stage is large | On-by-default but configurable; start with PII + injection + four-eyes; add OPA/risk/step-up as the deterministic runtime (customer-facing) lands |
| R7 | **Feasibility declared too early** | Discover claims "technically feasible" but feasibility is really proven at Architect/Build | Keep feasibility a *score* at Discover and a *confirmation* at Architect; consider a lightweight technical-spike artifact (see Q7) |
| R8 | **Cost of many model providers** | Each provider = keys, quotas, drift | Route everything through N2; default to one provider per project; cost-tracker alerts on burn |

## Open questions (decide by the noted phase)

| # | Question | Recommendation | Decide by |
|---|---|---|---|
| Q1 | Build the model router or wrap an existing lib? | **Wrap LiteLLM** (AF already uses it) + add the prompt registry on top | Phase 0 |
| Q2 | Graph store: Neo4j or Apache AGE? | **AGE in Postgres** for small/single-instance to avoid a second service; Neo4j when graph scale demands | Phase 3 |
| Q3 | Keep KMS in Node or fold into the Python service layer? | **Keep Node** initially behind the mesh; revisit after Phase 3 | Phase 3 |
| Q4 | Auth/SSO provider? | OIDC via the org's IdP; reuse KMS's RBAC role model | Phase 0 |
| Q5 | STT provider for audio ingest? | Pick one managed STT (e.g. cloud STT) behind a provider adapter; don't hand-roll | Phase 3/6 |
| Q6 | Multi-tenancy depth — how isolated are projects? | Row-level (RLS) by project on shared infra to start; hard isolation only if a tenant requires it | Phase 0 |
| Q7 | Add an explicit technical-spike step between Discover and Architect? | **Optional spike artifact** under Define; required only when uncertaintyScore is high | Phase 2 |
| Q8 | openclaw as a deploy target — define the interface now or defer? | **Defer** until a concrete need; it is explicitly non-central | Phase 6 |
| Q9 | Eval gate thresholds (quality/latency/cost) — who owns them? | Per-project in `policy_bundle.pre_deploy_gates`, owned by the project approver | Phase 5 |
| Q10 | Data residency / regulatory posture (banking domain) | Confirm before any non-local deploy; may constrain target choice (Q from compliance) | Phase 6 |
| Q11 | Does Academy graded content (A-level) belong on the same auth as the platform? | Separate auth domain for academic users; shared SSO for platform users | Phase 8 |

## Explicit non-goals (so they don't creep in)
- Building **Resonate** or **Mission Control** (separate products).
- Re-implementing **theatre-scout** or **pod-to-mp3** (dropped/parked).
- Making **openclaw** a central dependency (optional output target only).
- Real-money trading/betting execution (out of scope; lives in Mission Control which is out of scope anyway).

## "Definition of done" for the platform v1
Scope a topic → ground it (any retrieval mode, governed release) → build an agent (any paradigm) → prove it (multi-persona test + quality/latency/cost eval gate) → deploy it (≥2 targets, guardrails on, provenance on every answer) → operate it (live signals produce an accepted improvement that re-enters the pipeline). Academy provides per-stage help throughout. All artifacts linked end-to-end in the lineage.
