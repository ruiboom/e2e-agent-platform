# Stage 11 · Operate & improve — *Phase D: Run & improve* — closes the loop

> Learn from live traffic and auto-propose a better agent — which re-enters the
> pipeline.

## What it does
Every chat turn is logged (`chat_log`) with the top retrieval score and a
`flagged` bit when retrieval was weak. Operate runs **detect → diagnose →
prescribe**:
1. **detect** — pull the agent's recent logs, worst first.
2. **diagnose** — identify weak/flagged interactions (low retrieval score,
   off-topic questions the agent struggled with).
3. **prescribe** — call the router (`operate.improve`) to rewrite the
   `system_prompt`, and emit it as a **new `system_prompt` artifact version**
   (child of the current one).

That new version **re-enters the pipeline**: rebuilding the agent (Build) picks up
the improved prompt — the loop is closed.

## How to use it

**Console** → project → **Operate** (`/operate`). The header badges show the
agent version, deploy state, chat turns logged and how many were weak. **Run
Operate** runs detect → diagnose → prescribe and reports the weak questions it
found plus the rationale. Every proposal appears under **Improvement
proposals** — open one to read the **full proposed prompt** rendered, or **Edit**
it into a further version before adopting. To adopt, rebuild on the **Chat**
page; the new prompt re-enters Prove.

**API**
```bash
# after some real chat traffic against an agent_version:
curl -X POST localhost:8793/v1/operate -d '{"agent_version_id":"<AVID>"}'
# → { status:"proposed",
#     diagnosis:{ total_logs, weak, weak_questions[] },
#     new_system_prompt_id, new_version, rationale }

# then rebuild to adopt the improvement (Build picks the latest system_prompt):
curl -b jar -X POST localhost:3000/api/agent/build -d '{"projectId":"<PID>"}'
```

## Reads / Writes
- **Reads:** `chat_log` for the agent; the current `system_prompt`.
- **Writes:** a new `system_prompt` version with `{text, improved_from, rationale,
  source:"operate"}`, parent `[previous system_prompt]`.

## Tips
- The improved prompt is a **proposal**, not an auto-promotion — review it, then
  rebuild + re-evaluate (Gate 2) before deploying. This is the platform's safety
  rail against drift.
- `status:"no_logs"` means there's no traffic yet — chat with the agent first.

## Deferred
Production Operate runs intent-optimiser clustering over live logs, a
rewriter-admin self-improvement loop (feedback → draft → test → judge →
auto-promote), and wires live signals back to Discover/Specify/Ground/Build — not
just Specify.
