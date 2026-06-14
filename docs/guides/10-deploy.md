# Stage 10 · Deploy — *Phase D: Run & improve*

> Run the agent across targets + channels, with guardrails on and provenance on
> every answer.

## What it does
Emits a **deployment** artifact for an `agent_version` against a target and a set
of channels, with a guardrail policy attached. Deploy **enforces Gate 2** — it
refuses (`409`) unless the agent's latest evaluation passes the project gates. You
can deploy the same agent to several targets/channels. The agent serves through
the **Chat** UI; every answer carries the provenance tuple and a guardrails result.

## How to use it

**Console** → project → **Chat** → **Deploy (emit deployment)**, then chat with the
grounded agent (provenance chips appear under each answer).

**API**
```bash
curl -b jar -X POST localhost:3000/api/deploy \
  -d '{"agentVersionId":"<AVID>","target":"local","channels":["web","slack"]}'
curl -b jar -X POST localhost:3000/api/deploy \
  -d '{"agentVersionId":"<AVID>","target":"vercel","channels":["voice"]}'
# → 201 deployment   (or 409 { error:"blocked by Gate 2", reasons:[…] })
```

## Runtime guardrails (on by default)
Applied on every chat turn (`build-runtime`):
- **prompt-injection** → the turn is **blocked + escalated** (a safe refusal is
  returned; no model call).
- **PII** in the input → **redacted** before it reaches the model or the logs.

The chat response includes `guardrails: {injection, pii_redactions, escalated}` and
the deployment records `guardrail_policy` + `runtime_guards`.

## Chatting

```bash
curl -b jar -X POST localhost:3000/api/chat \
  -d '{"agentVersionId":"<AVID>","question":"What is the overdraft interest rate?"}'
# → { answer, retrieval_mode, guardrails, provenance{…5 keys…}, citations[], cost_usd, latency_ms }
```

## Reads / Writes
- **Reads:** `agent_version`, `policy_bundle` (via Gate 2).
- **Writes:** `deployment` parent `[agent_version]`; every chat writes a `chat_log`
  row (the Operate signal).

## Who can run it
`artifact:write` — contributor, steward, admin. (Chatting only needs to be authed.)

## Deferred
Production Deploy pushes to real targets (Vercel/GCP/Azure/SharePoint/Watson/
Dialogflow/LivePerson), 16 messaging gateways (hermes desktop client), an
agent-desk + human handoff, and a voice channel with STT — here a deployment is a
logical record + the in-console Chat surface.
