# Stage 9 · Evaluate — *Phase C: Prove* — and **Gate 2**

> Score the agent on quality · latency · cost — then block or pass the deploy.

## Evaluate

### What it does
Runs the agent against questions (or a `test_suite`), judges each answer with an
LLM **Judge** (`eval.judge`) for faithfulness + helpfulness, and aggregates an
`eval_run`: overall **quality**, mean **latency_ms**, total **cost_usd**, a
per-case breakdown, and (for a suite) a **per-persona** rollup.

### How to use it

**Console** → project → **Evaluate** (`/evaluate`) — the whole Prove flow on one
page: **Run test suite** (full multi-persona run) or **Quick eval** (default
questions). Results render inline: pass/fail badge, quality / latency / cost,
per-persona chips, and a per-case table with the judge's commentary under each
question. The **Artifacts** card at the bottom exposes the `agent_version`,
`test_suite` and `eval_run` artifacts — open any of them rendered, or edit the
suite into a new version and re-run.

**API**
```bash
# quick eval over ad-hoc questions
curl -X POST localhost:8792/v1/eval -d '{"agent_version_id":"<AVID>",
  "questions":["What is the overdraft interest rate?"]}'

# full multi-persona run over a generated suite
curl -X POST localhost:8792/v1/run-suite \
  -d '{"agent_version_id":"<AVID>","test_suite_id":"<TS>"}'
# → { eval_run_id, metrics:{quality,latency_ms,cost_usd}, perPersona, gateResult }
```

### Reads / Writes
- **Reads:** `agent_version` (+ `test_suite`); retrieves context from Ground; routes
  judge calls through the model-router (so judge cost is tracked too).
- **Writes:** `eval_run` parents `[agent_version]` (and `[test_suite]` for a suite run).

---

## Gate 2 — quality · latency · cost

The boundary between **Prove** and **Run & improve**. It reads the agent's latest
`eval_run` and checks it against the project's `pre_deploy_gates`.

### How to use it

**Console** → **Evaluate** page → **Policy — pre-deploy gates** card: set min
quality / max latency / max cost and **Save policy** (needs `artifact:approve` —
separation of duties). Then **Check Gate 2** shows pass/blocked with the failing
reasons and the risk tier.

**API**
```bash
# set the project's gates (any of quality/latency_ms/cost_usd)
curl -X POST localhost:8792/v1/policy \
  -d '{"project_id":"<PID>","pre_deploy_gates":{"quality":0.6,"latency_ms":4000,"cost_usd":0.05}}'

# check the gate
curl -X POST localhost:8792/v1/gate2 -d '{"project_id":"<PID>","agent_version_id":"<AVID>"}'
# → { pass, reasons:["quality 0.55 < 0.6", …], metrics, gates, gate2_id }
```

- `quality` is a **minimum**; `latency_ms` and `cost_usd` are **maximums**.
- On pass it emits a `gate2` artifact (parent `[agent_version]`).
- **Deploy enforces Gate 2**: `POST /api/deploy` returns `409` with the failing
  reasons if the gate doesn't pass.

### Tips
- Run an eval **before** deploying, or Gate 2 reports "no eval_run for this
  agent_version" and the deploy is blocked.
- If no policy is set, Gate 2 falls back to a default `quality ≥ 0.6`.

### Deferred
Production Evaluate runs the full DeepEval 11-metric suite, a latency+cost
manager UX, flexible log import, and the customer-facing 4 eval-gate suites
(intent/risk/abstention/groundedness).
