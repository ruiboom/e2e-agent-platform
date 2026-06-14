# 03 · Stage specs

Per-stage implementation spec. Each stage states its **responsibility**, **seed apps**, **reuse vs rebuild**, the **artifact contract** (what it reads and writes in the lineage — the integration points that make this a pipeline), **net-new work**, and **acceptance criteria**.

Artifact types are rows in `artifact(type, version, payload jsonb, parents[])` from `00-architecture.md`. Payloads below are the shape of `artifact.payload`.

---

## Stage 1 · Discover
- **Responsibility:** validate that a problem/opportunity is real and roughly feasible.
- **Seed apps:** experiment-management-system (hypothesis tracking/scoring); news.facts (signal analysis); news-agents (research synthesis).
- **Reuse vs rebuild:** EXTEND experiment-mgmt to Postgres + lineage; LIBRARY-IFY news.facts clustering/corroboration and news-agents synthesis into modules.
- **Reads:** project; raw sources (via Ground ingest).
- **Writes:** `opportunity`
  ```json
  { "problem": "…", "evidence": [{"claim":"…","sources":["url"],"corroboration":2}],
    "marketNotes": "…", "feasibilityScore": 1-3, "uncertaintyScore": 1-3,
    "experimentId": "EX-NNN", "status": "validated|rejected" }
  ```
- **Net-new:** generalise news.facts from "news" to any external input (reviews, support logs, market scans); research-pack generator with a QA gate.
- **Acceptance:** create a scored `opportunity` with ≥2-source corroboration on its key claims; rejected opportunities are recorded, not deleted.

## Stage 2 · Define
- **Responsibility:** turn a validated opportunity into a crisp, feasible proposition.
- **Seed apps:** experiment-mgmt + **research→proposition tool (NEW)**.
- **Reads:** `opportunity`.
- **Writes:** `proposition`
  ```json
  { "targetUser":"…", "need":"…", "capabilities":["…"], "successMetrics":["…"],
    "tovDirection":"…", "feasibilityCheck":"…", "compliancePrecheck":"…",
    "status":"draft|signed_off" }
  ```
- **Net-new:** the proposition authoring module (see `04-net-new.md`).
- **Acceptance:** a `proposition` linked to its `opportunity`; **Gate 1** cannot pass without `status=signed_off`.

## Stage 3 · Specify
- **Responsibility:** detailed, buildable spec + system prompt + KB outline + tone-of-voice overlay + constraints.
- **Seed apps:** scope-maker (EXTEND); style-ripper (ToV, LIBRARY-IFY); prompt-improver (PORT-UI).
- **Reads:** `proposition`.
- **Writes:** `scope`, `system_prompt`, `kb_outline`, `tov_overlay`, `constraints`
  ```json
  // scope
  { "outline": [{"title":"…","children":[…]}] }
  // tov_overlay
  { "tone":"…","vocabulary":["…"],"sentence":"…","register":"e.g. child-facing","sourceDocs":["…"] }
  // constraints
  { "compliance":["…"],"safety":["…"],"privacy":["…"] }
  ```
- **Net-new:** none (compose existing).
- **Acceptance:** scope + system_prompt + kb_outline + tov_overlay + constraints all linked to the `proposition`; six bidirectional regenerations (scope↔KB↔system-prompt) work.

## Stage 4 · Architect
- **Responsibility:** lock the technical shape before planning.
- **Seed apps:** **ADR module (NEW)**.
- **Reads:** `scope`, `constraints`.
- **Writes:** `adr`
  ```json
  { "buildParadigm":"langgraph|adk|code|canvas|generative",
    "runtime":"…","retrievalStrategy":"vector|lexical|hybrid|graph|graph_hybrid",
    "storageProjections":["pgvector","neo4j","sql","graphql","flat"],
    "channels":["web","slack","voice","…"], "deployTarget":"gcp|azure|vercel|…",
    "guardrailPolicyRef":"policy_bundle.id" }
  ```
- **Net-new:** the ADR capture module (`04-net-new.md`).
- **Acceptance:** an `adr` linked to `scope`; **Gate 1** also requires the `adr` to exist; the chosen `retrievalStrategy`/`runtime` are valid enum values the Ground/Build stages support.

## Stage 5 · Plan
- **Responsibility:** costed, staffed plan to live.
- **Seed apps:** jira-ticket-builder (EXTEND); resource-planner (ADOPT).
- **Reads:** `scope`, `adr`, infra details.
- **Writes:** `plan`
  ```json
  { "epics":[{"summary":"…","stories":[{"summary":"…","tasks":["…"],"points":3}]}],
    "resourcing":[{"person":"…","team":"…","role":"…"}], "csvExportUrl":"…" }
  ```
- **Net-new:** none.
- **Acceptance:** `plan` linked to `scope`+`adr`; Jira-importable CSV exports; resourcing fill-ratios computed.

> **Gate 1 — proposition + architecture signed off.** Reads `proposition.status` and presence of `adr`. Human go/no-go; recorded as an audit event.

---

## Stage 6 · Ground (kernel)
- **Responsibility:** one canonical, governed source of truth, exposed many ways; produce a pinned KB release.
- **Seed apps:** knowledge-management-system (KERNEL); graphBOT (graph/hybrid serve + MCP); graph-enricher (KG enrichment); simple-scraper (ingest/cleaners); **connectors (NEW)**.
- **Reads:** project sources; `kb_outline`.
- **Writes:** canonical items + `kb_release`
  ```json
  { "release_key":"kb-2026-06-14", "item_revisions":[{"item_id":"…","revision_id":"…"}],
    "content_hash":"…", "retrieval_indexes":["pgvector","neo4j"] }
  ```
- **Reuse vs rebuild:** ADOPT+deepen KMS; LIBRARY-IFY graphBOT/graph-enricher/simple-scraper into the ground service; NEW connectors (RSS→GitHub→Confluence→STT).
- **Law:** canonical store is the only source of truth; vector/graph/SQL/GraphQL/flat are rebuildable projections.
- **Acceptance:** ingest from web + docs + API + RSS → governed canonical store (four-eyes) → all six retrieval modes queryable → pin a `kb_release` that an `agent_version` consumes; every chunk returns `{release_key,item_id,revision_id,chunk_id}`.

## Stage 7 · Build
- **Responsibility:** produce a runnable agent from the spec + knowledge.
- **Seed apps:** AF (canvas/graph + LangGraph); flexi (YAML multi-agent); VCBL (flow + Watson/Dialogflow); visioXfable5 (import); external-processing-manager (LLM gateway); **generative builder (NEW)**.
- **Reads:** `system_prompt`, `kb_release`, `adr`, `tov_overlay`.
- **Writes:** `agent_version`
  ```json
  { "build_paradigm":"…","runtime":"…","retrieval_strategy":"…",
    "kb_release_id":"…","system_prompt_artifact_id":"…","tov_overlay_id":"…","config":{…} }
  ```
- **Net-new:** generative agent builder (after deterministic paths proven).
- **Acceptance:** the same spec builds via canvas, flow, YAML multi-agent and generative — each yields an `agent_version` that chats and passes a basic eval; the `retrieval_strategy` matches the `adr`.

---

## Stage 8 · Test
- **Responsibility:** pre-deploy synthetic proof.
- **Seed apps:** CHATBOT_TEST_SET_GENERATOR (personas/coverage); CHATBOT_REGRESSION (path+vision); AF (synthetic); **multi-persona runner (NEW)**.
- **Reads:** `agent_version`, `scope`.
- **Writes:** `test_suite`
  ```json
  { "personas":[{"name":"…","style":"…"}], "tags":["topic","behavior","scope_boundary","out_of_scope"],
    "cases":[{"utterance":"…","expected":"…","tags":["…"],"persona":"…","difficulty":"easy|medium|hard"}],
    "multiTurn":[{"persona":"…","turns":[…]}] }
  ```
- **Net-new:** multi-persona test runner.
- **Acceptance:** generate persona + coverage-tagged + path/vision-derived cases; run multi-persona conversations; store/export (CSV/JSON/Pytest).

## Stage 9 · Evaluate
- **Responsibility:** quality/latency/cost gate (pre-deploy) and continuous (post-deploy).
- **Seed apps:** chat-eval (EXTEND); customer-facing eval-gate suites (LIBRARY-IFY).
- **Reads:** `agent_version` + `test_suite` (synthetic) and/or live logs.
- **Writes:** `eval_run`
  ```json
  { "source":"synthetic|live", "metrics":{"quality":0.0,"latency_ms":0,"cost_usd":0.0},
    "deepeval":{"faithfulness":0.0,"answer_relevancy":0.0,"…":0.0},
    "perCase":[{"id":"…","score":0.0,"class":"good|neutral|poor","commentary":"…"}],
    "gateResult":"pass|fail" }
  ```
- **Net-new:** latency + cost per run; manager UX; flexible log import.
- **Acceptance:** DAG eval with Judge/DeepEval/Classify nodes; quality + latency + cost computed; **Gate 2** blocks deploy on fail.

> **Gate 2 — evaluation pass (quality · latency · cost).** Reads the latest `eval_run.gateResult` against `policy_bundle.pre_deploy_gates`. Human go/no-go on borderline; auto-block on fail.

---

## Stage 10 · Deploy
- **Responsibility:** run the agent across targets/channels with guardrails.
- **Seed apps:** customer-facing-agentic-service (ADK runtime + guardrails + agent-desk); hermes (channels, separate client); ally (accessible web/widget); VCBL/visioXfable5 (Watson/Dialogflow export); markdown-to-lp (LivePerson); text-to-voice (voice/SSML).
- **Reads:** `agent_version`, `policy_bundle`.
- **Writes:** `deployment`
  ```json
  { "agent_version_id":"…","target":"…","channels":["…"],
    "guardrail_policy_id":"…","status":"live|paused","provenance":true }
  ```
- **Net-new:** STT for voice ingest.
- **Acceptance:** deploy one `agent_version` to ≥2 targets + ≥3 channels; runtime guardrails (PII/injection/risk/OPA/step-up/escalation) active; every answer carries the provenance tuple.

## Stage 11 · Operate & improve (close the loop)
- **Responsibility:** improve the agent from real traffic.
- **Seed apps:** intent-optimiser (detect/diagnose/prescribe); rewriter-admin (self-improving prompts).
- **Reads:** live logs, feedback, cost/latency, `eval_run` (live).
- **Writes:** improvement proposals → **new versions** of `proposition`/`scope`/`system_prompt`/`kb_release` (re-entering the pipeline).
- **Net-new:** wire live signals → Discover/Specify/Ground/Build.
- **Acceptance:** a live agent's logs produce an accepted improvement that creates a new artifact version and re-runs the relevant downstream stages (loop closed).

---

## Academy (on the backbone)
- **Responsibility:** group existing courses + per-stage platform enablement.
- **Seed apps:** A-level-revision (player/progress/gamification/AI-marking); the 4 static courses + ai-content-workshop; scope-maker/prompt-improver (authoring aids).
- **Reads:** stage modules (for live "how-it-works"), course content.
- **Writes:** course progress + enablement content keyed to stage ids.
- **Net-new:** per-stage enablement layer (how-it-works/guides/training) mapped 1:1 to the 11 stages; role paths.
- **Acceptance:** every stage has contextual help that reads live from the platform; a learner completes a role path (e.g. Conversation Designer = Specify→Build→Test); static courses keep working with their existing localStorage namespaces; graded A-level keeps accounts.
