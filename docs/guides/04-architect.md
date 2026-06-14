# Stage 4 · Architect — *Phase A: Shape & plan*

> Lock the technical shape before planning: an **ADR**.

## What it does
Captures the architecture decision record — build paradigm, runtime, retrieval
strategy, storage projections, channels, deploy target, guardrail policy — and
**validates** it. Invalid combinations are rejected, e.g. choosing `graph`
retrieval without a `neo4j` storage projection. The ADR's `retrievalStrategy` and
`buildParadigm` flow straight into **Build** (the agent is built with exactly the
strategy the ADR specifies). The ADR is the second condition for **Gate 1**.

## How to use it

**Console** → **Shape & plan** → step *4 · Architect* → **Capture ADR** (the UI
offers a sensible default: `code` / `vector` / `local`).

**API**
```bash
curl -b jar -X POST localhost:3000/api/shape -H 'Content-Type: application/json' \
  -d '{"action":"architect","projectId":"<PID>","adr":{
        "buildParadigm":"code","runtime":"rag-v1","retrievalStrategy":"hybrid",
        "storageProjections":["pgvector"],"channels":["web"],"deployTarget":"local"}}'
```

Validation rules:
- `buildParadigm` ∈ `langgraph | adk | code | canvas | generative`
- `retrievalStrategy` ∈ `vector | lexical | hybrid | graph | graph_hybrid`
- `graph`/`graph_hybrid` require `storageProjections` to include `neo4j`.

## Reads / Writes
- **Reads:** latest `scope` (and `constraints` if present).
- **Writes:** `adr` → the full decision record, parent `[scope]`.

## Who can run it
`artifact:write` — contributor, steward, admin.

## Tips
- The ADR is where you choose how the agent retrieves. Build reads it: an ADR with
  `retrievalStrategy: hybrid` yields an `agent_version` that retrieves via RRF.
- Feasibility asserted at Discover is *confirmed* here — this is the right place to
  reject an infeasible technical shape.
