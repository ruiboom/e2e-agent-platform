# 04 · API reference

Two layers: the **console API** (auth-aware, browser-facing, proxies to services)
and the **service APIs** (internal, no auth in dev). Scripts and `verify-m*`
exercise both.

---

## Console API (`http://localhost:3000`)

Auth is a dev-stub cookie. Obtain it with a cookie jar:

```bash
curl -c jar -X POST 'localhost:3000/api/dev-login?user=alice'   # alice|carol|bob
curl -b jar  localhost:3000/api/projects
```

| Method · Path | Body | Returns | RBAC |
|---|---|---|---|
| `POST /api/dev-login?user=` | — | `{ok, userId, role}` + sets cookie | — |
| `GET /api/projects` | — | `{projects:[…]}` | authed |
| `POST /api/projects` | `{name, slug?, domain?}` | `201 Project` / `403` / `409` | `project:create` |
| `POST /api/route` | `{prompt_key, vars, project_id?}` | router `RouteResponse` | authed |
| `POST /api/specify` | `{projectId, topic}` | `201 {scopeId, systemPromptId, kbOutlineId}` | `artifact:write` |
| `POST /api/shape` | `{action, projectId, …}` | per-action (below) | per-action |
| `POST /api/artifacts` | `{artifactId, payload}` | `{id, type, version}` — **edit-as-append**: a new version of the same type, parented on `artifactId` | `artifact:write` |
| `POST /api/ground` | `{action, projectId, …}` | per-action (below) | per-action |
| `POST /api/agent/build` | `{projectId, paradigm?}` | `{agent_version_id, version, release_key, build_paradigm}` | `artifact:write` |
| `POST /api/eval` | `{action, …}` | per-action (below) | per-action |
| `POST /api/deploy` | `{agentVersionId, target?, channels?}` | `201 deployment` / `409 Gate 2` | `artifact:write` |
| `POST /api/chat` | `{agentVersionId, question}` | chat result (answer + provenance + guardrails) | authed |
| `POST /api/operate` | `{agentVersionId}` | optimise `/v1/operate` result (diagnosis + proposed system_prompt version) | `artifact:write` |
| `GET /api/academy/status` | — | `{stages, liveStages, services, projects}` | authed |
| `GET /api/academy/progress?path=` | — | `{path, done[], complete}` | authed |
| `POST /api/academy/progress` | `{path, stageId}` | `{path, done[], complete}` | authed |
| `GET /api/audit/verify` | — | `{ok, count, …}` — walks the hash chain (H1) | authed |
| `POST /api/admin/retention` · `/api/admin/dsar` | see [07 · Hardening](07-hardening.md) | retention purge / DSAR export+erase | `data:admin` |

**`/api/shape` actions** (`{action, projectId, …}`): `discover {problem}` →
opportunity · `define {}` → proposition (draft) · `signoff {}` → proposition
(signed_off; needs `artifact:approve`) · `architect {adr}` → adr (enum-validated) ·
`plan {}` → plan · `gate1 {}` → `{pass, reasons, gateId?}`.

**`/api/ground` actions** (`{action, projectId, …}`): `ingest {docs[], submittedBy?}`
(also how the console **edits a KB document** — re-ingesting a URI creates the next
revision) · `connect {kind: web|rss|github, url?, paths?, submittedBy?}` · `approve
{revisionId}` (needs `artifact:approve`; four-eyes enforced in the service) ·
`release {kbOutlineArtifactId?, enrich?}` · `enrich {releaseKey}`. All but
`approve` need `artifact:write`.

**`/api/eval` actions**: `testsuite {agentVersionId}` · `run-suite {agentVersionId,
testSuiteId}` · `eval {agentVersionId, questions?}` (all `artifact:write`) ·
`get-policy {projectId}` · `gate2 {projectId, agentVersionId}` (authed) ·
`set-policy {projectId, preDeployGates, opaRules?}` (`artifact:approve`).

---

## model-router (`:8789`)

```
POST /v1/route
  { prompt_id | prompt_key, version?, vars{}, model_pref?, project_id? }
→ { text, model, tokens:{input,output}, cost_usd, latency_ms, prompt_version }

POST /v1/prompts                         { key, name }
POST /v1/prompts/{key}/versions          { version?, template, default_model?, activate? }
POST /v1/prompts/{key}/activate?version=N
GET  /v1/prompts/{key}                   → { key, active_version, versions[] }
GET  /healthz
```

Every `/v1/route` call emits tokens/cost/latency to cost-tracker automatically.

---

## ground (`:8790`)

```
POST /v1/ingest    { project_id, docs:[{uri,title,body}], submitted_by? }
                   → { items:[{item_id, revision_id, state, chunks}] }
POST /v1/connect   { project_id, kind:"rss"|"web"|"github", url?|content?, paths?, submitted_by? }
                   → { connector, items:[…] }     (RSS/HTML/GitHub-repo → ingest docs)
POST /v1/approve   { revision_id, approver }               → 400 on four-eyes violation
POST /v1/release   { project_id, kb_outline_artifact_id? }
                   → { release_key, kb_release_artifact_id, item_count, content_hash }
POST /v1/retrieve  { project_id, release_key, query, k?, mode? }
                   → { mode, chunks:[{chunk_id, revision_id, item_id, heading_path, body, score}] }
GET  /healthz      → { status, modes }
```

`mode` ∈ `vector | lexical | hybrid | graph | graph_hybrid`. Release pins only
**approved** revisions; retrieval is scoped to them.

---

## build-runtime (`:8791`)

```
POST /v1/agent-version { project_id, system_prompt_artifact_id, kb_release_artifact_id,
                         retrieval_strategy?, build_paradigm? }
                       → { agent_version_id, version, release_key, build_paradigm }
POST /v1/build         { project_id, paradigm, system_prompt_artifact_id,
                         kb_release_artifact_id, retrieval_strategy? }   (paradigm dispatcher)
POST /v1/chat          { agent_version_id, question, k? }
                       → { answer, retrieval_mode, guardrails, provenance, citations[],
                           model, cost_usd, latency_ms }
GET  /healthz
```

`paradigm` ∈ `code | canvas | flow | yaml | generative` (generative synthesizes
its config via the router and is flagged unvalidated until eval). `chat` applies
runtime guardrails and writes a `chat_log` row.

---

## eval (`:8792`)

```
POST /v1/eval       { agent_version_id, questions? }      → { eval_run_id, metrics, gateResult, perCase }
POST /v1/testsuite  { agent_version_id }                  → { test_suite_id, personas, cases }
POST /v1/run-suite  { agent_version_id, test_suite_id }   → { eval_run_id, metrics, perPersona, gateResult }
GET  /v1/policy?project_id=                               → { pre_deploy_gates }
POST /v1/policy     { project_id, pre_deploy_gates }      → { project_id, pre_deploy_gates }
POST /v1/gate2      { project_id, agent_version_id }       → { pass, reasons[], metrics, gates, gate2_id? }
GET  /healthz
```

`pre_deploy_gates` keys: `quality` (min), `latency_ms` (max), `cost_usd` (max).
`metrics` = `{quality, latency_ms, cost_usd}`.

---

## optimise (`:8793`)

```
POST /v1/operate { agent_version_id }
  → { status:"proposed"|"no_logs", diagnosis:{total_logs, weak, weak_questions[]},
      new_system_prompt_id, new_version, rationale }
GET  /healthz
```

Reads `chat_log`, diagnoses weak turns, calls `operate.improve`, emits a new
`system_prompt` artifact version (child of the current).

---

## Observability seeds

- **cost-tracker (`:8787`)** — `POST /v1/events`, `GET /v1/stats/{cards,timeseries,breakdown}`, `GET /v1/events/recent`, `GET /v1/meta`. Dashboard at `/`.
- **feedback-tracker (`:8788`)** — `POST /v1/feedback`, `GET /v1/feedback`, `PATCH /v1/feedback/{id}`, `GET /v1/stats/*`. Widget at `/widget/feedback-widget.js`.
