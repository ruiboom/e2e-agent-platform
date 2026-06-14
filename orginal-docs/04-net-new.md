# 04 · Net-new components

Detailed specs for the parts that don't exist yet (or exist only partially). Each: **purpose, inputs/outputs, approach, dependencies, effort, risk, acceptance.** Effort is T-shirt (S/M/L/XL); risk is L/M/H.

---

## N1 · Artifact-lineage store + project/workspace model  — `M`, risk M
- **Purpose:** the "golden thread" — every stage emits a versioned, parent-linked artifact under a project. Foundation for everything.
- **In/out:** any stage writes `artifact(type, version, payload, parents[])`; reads ancestors/descendants.
- **Approach:** Postgres tables from `00-architecture.md`; `packages/lineage-client` (TS) + `py/lineage` (Python) with identical contracts; an immutable append model (new version, never in-place edit); a `lineage` view in the console (timeline + diff per artifact).
- **Dependencies:** none (Phase 0).
- **Acceptance:** create→version→link artifacts; render the lineage DAG for a project; roll an `agent_version` back to a prior `kb_release`.

## N2 · Model router + prompt/version registry  — `M`, risk M
- **Purpose:** one seam over all LLM/embedding providers; versioned prompts; automatic cost/latency accounting.
- **In/out:** `route(prompt_id, version, vars, model_pref) → {text, tokens, cost, latency}`; emits usage to cost-tracker.
- **Approach:** consider wrapping an existing multi-provider lib (e.g. LiteLLM, which AF already uses) rather than hand-rolling; add the prompt registry (create/activate/rollback) on top. Adapters: Anthropic, Gemini/Vertex, OpenAI, Grok, Ollama, OpenRouter.
- **Dependencies:** cost-tracker (Phase 0).
- **Acceptance:** any stage calls the router by `(prompt_id, version)`; switching provider needs no stage change; cost + latency land in the dashboard.

## N3 · research → proposition tool  — `M`, risk M
- **Purpose:** Stage 2 (Define). Turn a validated `opportunity` into a signed-off `proposition`.
- **In/out:** reads `opportunity`; writes `proposition` (target user, need, capabilities, success metrics, ToV direction, feasibility + compliance pre-check, status).
- **Approach:** new module on the experiment-management-system seed (it already has the state-machine + scoring + audit). Add a proposition entity + sign-off transition feeding Gate 1.
- **Dependencies:** N1, experiment-mgmt seed (Phase 2).
- **Acceptance:** opportunity → proposition with a sign-off gate; rejected propositions retained; audit on every transition.

## N4 · ADR / architect module  — `S`, risk L
- **Purpose:** Stage 4. Capture the technical decisions that unblock planning.
- **In/out:** reads `scope`+`constraints`; writes `adr` (build paradigm, runtime, retrieval strategy, projections, channels, deploy target, guardrail policy ref).
- **Approach:** a small console form + validation that the chosen enums are supported by Ground/Build; links to `policy_bundle`.
- **Dependencies:** N1; the build/retrieval enums from Phases 3–4.
- **Acceptance:** an `adr` artifact gates Gate 1; invalid combinations (e.g. graph retrieval with no graph projection) are rejected.

## N5 · Ground connectors  — RSS `S` · GitHub `M` · Confluence/Jira `M` · STT/audio `M` · broadened OCR `S`; risk M
- **Purpose:** extend KMS ingest beyond what exists (web scrape, docs+OCR, API pull/push/webhook, MCP).
- **In/out:** each connector → normalised content into the canonical store with provenance + scheduled refresh.
- **Approach:** implement against the KMS ingest interface so they inherit hashing/snapshot/governance for free. Build order: **RSS → GitHub → Confluence/Jira → STT** (audio transcription is the genuine gap; pick a provider — see open questions) → broadened OCR.
- **Dependencies:** KMS kernel (Phase 3).
- **Acceptance:** each source type ingests, dedupes, snapshots and refreshes on schedule; STT turns an audio file into a governed, searchable item.

## N6 · Multi-persona test runner  — `M`, risk M
- **Purpose:** Stage 8. Run a suite across many personas concurrently and aggregate.
- **In/out:** reads `agent_version`+`test_suite`; writes multi-persona results into the `test_suite`/`eval_run`.
- **Approach:** orchestrate the existing single-persona generation (test-set-gen) + synthetic multi-turn (AF) across a persona matrix; concurrency-capped; per-persona breakdown.
- **Dependencies:** test-set-gen + AF (Phase 5).
- **Acceptance:** one run exercises N personas × M scenarios with a per-persona pass/fail rollup.

## N7 · Eval latency + cost  — `S`, risk L
- **Purpose:** Stage 9. Make latency and $ first-class eval metrics, not just quality.
- **In/out:** every `eval_run.metrics` includes `latency_ms` + `cost_usd` (from the model router) alongside quality/DeepEval.
- **Approach:** thread router accounting into chat-eval; surface in the manager UX; wire into Gate 2 thresholds.
- **Dependencies:** N2, chat-eval (Phase 5).
- **Acceptance:** Gate 2 can fail an agent for being too slow or too expensive, not only low-quality.

## N8 · Generative agent builder  — `XL`, risk H
- **Purpose:** Stage 7. Generate a runnable agent directly from the golden-thread artifacts.
- **In/out:** reads `system_prompt`+`kb_release`+`adr`+`tov_overlay`; writes an `agent_version`.
- **Approach:** start narrow — generate config for an *existing* runtime (LangGraph/ADK) rather than free-form code; validate every generated agent against the Stage 8/9 suite before it can be promoted. **Sequence last** (after deterministic canvas/flow/YAML/ADK paths work), so there is always a baseline to compare against.
- **Dependencies:** Phases 1 + 4 deterministic builds proven.
- **Risk controls:** never auto-promote a generated agent that hasn't passed Gate 2; diff generated config against a human-built baseline.
- **Acceptance:** generate an agent that passes the same eval as its hand-built equivalent on a reference project.

## N9 · Academy per-stage enablement  — `M`, risk L
- **Purpose:** Stage-aware help/training that never drifts from the UI.
- **In/out:** reads the live stage modules; writes enablement content + role paths keyed to stage ids.
- **Approach:** generalise A-level-revision's player; map content 1:1 to the 11 stages; reuse creating-knowledgebases-course (→ Ground), PROMPT_DESIGN_COURSE (→ Specify/Build), ai-content-workshop (→ Specify→Build lab).
- **Dependencies:** stage UIs (Phases 2–7).
- **Acceptance:** contextual help on every stage; at least one completable role path.

---

## Effort roll-up
| Item | Effort | Risk | Phase |
|---|---|---|---|
| N1 lineage + project | M | M | 0 |
| N2 model router + registry | M | M | 0 |
| N3 proposition tool | M | M | 2 |
| N4 ADR module | S | L | 2 |
| N5 connectors | S–M ×5 | M | 3 (+6 for STT) |
| N6 multi-persona runner | M | M | 5 |
| N7 eval latency+cost | S | L | 5 |
| N8 generative builder | XL | H | 4 (last) |
| N9 Academy enablement | M | L | 8 |
