# Stage 8 · Test — *Phase C: Prove*

> Generate a multi-persona, coverage-tagged **test suite**.

## What it does
From the agent's `system_prompt`, the router (`test.suite`) generates a
`test_suite` artifact: a set of **personas** (name + style) and **cases**
(utterance, expected answer, coverage tags, persona, difficulty). The suite is
what **Evaluate** runs the agent against, persona by persona.

## How to use it

**Console** → project → **Evaluate** (`/evaluate`) → **Generate test suite** (or
**Regenerate** for a new version). The suite appears in the page's **Artifacts**
card — open it to read every persona and case rendered, or **Edit** it (e.g.
sharpen an expected answer, add a tag) into a new version before running.

**API**
```bash
curl -X POST localhost:8792/v1/testsuite -d '{"agent_version_id":"<AVID>"}'
# → { test_suite_id, personas: 2, cases: 4 }

# or through the console proxy (cookie auth):
curl -b jar -X POST localhost:3000/api/eval \
  -d '{"action":"testsuite","agentVersionId":"<AVID>"}'
```

## Reads / Writes
- **Reads:** the `agent_version` (→ its `system_prompt`).
- **Writes:** `test_suite` → `{personas[], tags[], cases[]}`, parent `[agent_version]`.

## Who can run it
`artifact:write` (contributor, steward, admin) through the console's `/api/eval`
proxy; the service itself has no auth gate in dev.

## Tips
- Cases carry a `persona` field; Evaluate rolls scores up **per persona**, which
  surfaces where an agent is weak (e.g. "Technical Tom 0.55" vs "Anxious Amy 0.83").
- Tags include `topic`, `behavior`, `scope_boundary`, `out_of_scope` — useful for
  checking the agent declines off-topic questions.

## Deferred
Production Test adds persona/coverage generation (test-set-gen), path + vision
regression (CHATBOT_REGRESSION), AF synthetic multi-turn, and a concurrency-capped
multi-persona runner.
