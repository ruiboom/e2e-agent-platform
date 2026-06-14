# Stage 7 · Build — *Phase B: Make*

> Produce a runnable **agent_version** from the spec + a pinned knowledge release.

## What it does
Combines a `system_prompt` artifact with a pinned `kb_release` to produce an
`agent_version` — a runnable, RAG-grounded agent. The agent can be authored via
four **paradigms**; in this platform they are authoring surfaces over one shared
retrieve→generate runtime, so each produces a valid `agent_version` that chats and
evaluates identically:

| Paradigm | Config |
|---|---|
| `code` | the bare RAG runtime |
| `canvas` | a node-graph config (`retrieve → generate`) |
| `flow` | a conversational-flow config |
| `yaml` | a YAML multi-agent topology |
| `generative` | config **synthesized by the router** from the spec, flagged unvalidated until eval passes |

The agent's **retrieval strategy** comes from the ADR (`vector`, `hybrid`, …).

## How to use it

**Console** → project → **Chat** → **Build agent** (uses the latest
`system_prompt` + `kb_release`, and the ADR's paradigm/strategy).

**API (console proxy)**
```bash
curl -b jar -X POST localhost:3000/api/agent/build \
  -d '{"projectId":"<PID>","paradigm":"canvas"}'
# → { agent_version_id, version, release_key, build_paradigm }
```

**API (service direct)**
```bash
curl -X POST localhost:8791/v1/build -d '{
  "project_id":"<PID>","paradigm":"generative",
  "system_prompt_artifact_id":"<SP>","kb_release_artifact_id":"<KBR>",
  "retrieval_strategy":"hybrid"}'
```

## Reads / Writes
- **Reads:** latest `system_prompt` + `kb_release` (+ the ADR for paradigm/strategy).
- **Writes:** `agent_version` (parents `[system_prompt, kb_release]`) with
  `{build_paradigm, runtime, retrieval_strategy, release_key, config}`.

## Who can run it
`artifact:write` — contributor, steward, admin.

## Tips
- Building again creates a **new** `agent_version` (immutable append) — you can
  build the same spec several ways and compare them in Evaluate.
- The **generative** paradigm sets `config.validated=false` until it passes
  evaluation — never promote an unvalidated generated agent to deploy.

## Deferred
Production Build wires the real runtimes — LangGraph/ADK (AF), flexi YAML
multi-agent, VCBL conversational flows, Visio import, and a deterministic LLM
gateway — each a distinct execution engine rather than a config over one runtime.
