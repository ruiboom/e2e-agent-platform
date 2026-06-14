# Stage 3 · Specify — *Phase A: Shape & plan*

> Produce the buildable spec: **scope**, **system prompt**, and **KB outline**.

## What it does
From a topic, one model-router call (`specify.spec`) generates three linked
artifacts at once:
- **scope** — a sectioned outline of what the agent covers.
- **system_prompt** — a concise, production-ready system prompt.
- **kb_outline** — the knowledge-base topics needed to ground the agent.

These are the inputs the rest of the pipeline builds on: `system_prompt` feeds
**Build**, `kb_outline` feeds **Ground**'s release.

## How to use it

**Console** → project → **Specify** → enter a topic → **Generate spec**. You land
on the **Lineage** tab showing the three new artifacts.

**API**
```bash
curl -b jar -X POST localhost:3000/api/specify \
  -d '{"projectId":"<PID>","topic":"A help assistant for UK current accounts"}'
# → 201 { scopeId, systemPromptId, kbOutlineId }
```

## Reads / Writes
- **Reads:** the latest **signed-off** `proposition` if one exists (to link the chain).
- **Writes:** `scope` (parent = signed-off proposition, or `[]`), then
  `system_prompt` and `kb_outline` (parents `[scope]`).

## Who can run it
`artifact:write` — contributor, steward, admin.

## Tips
- Re-running Specify creates **new versions** of all three artifacts (immutable
  append) — earlier versions are preserved and can be diffed in the Lineage tab.
- The generated `system_prompt` is what the **Operate** loop later rewrites when it
  learns from live traffic.

## Deferred
Production Specify composes dedicated tools: scope-maker, a tone-of-voice overlay
(`tov_overlay`) from a style-ripper, a constraints capture step (`constraints`),
and a prompt-improver. Here it's a single composed generation.
