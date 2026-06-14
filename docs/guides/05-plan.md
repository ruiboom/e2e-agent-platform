# Stage 5 · Plan — *Phase A: Shape & plan* — and **Gate 1**

> A costed, staffed plan — then the human go/no-go before Make.

## Plan

### What it does
Reads the `scope` and `adr` and produces a `plan`: epics → stories → tasks with
point estimates, a resourcing list, and a Jira-importable **CSV** (stored on the
artifact as `payload.csv`).

### How to use it
**Console** → **Shape & plan** → step *5 · Plan* → **Generate plan**.
**API:** `POST /api/shape {"action":"plan","projectId":"<PID>"}`.

### Reads / Writes
- **Reads:** latest `scope` + `adr`.
- **Writes:** `plan` parents `[scope, adr]`, with `payload.csv`.

---

## Gate 1 — proposition + architecture signed off

The boundary between **Shape & plan** and **Make**. It passes only when:
1. the latest `proposition` has `status: signed_off`, **and**
2. an `adr` exists.

### How to use it
**Console** → **Shape & plan** → **Check Gate 1**. The badge turns green when both
conditions hold; otherwise it lists what's missing.

**API**
```bash
curl -b jar -X POST localhost:3000/api/shape \
  -d '{"action":"gate1","projectId":"<PID>"}'
# → { "pass": true|false, "reasons": ["proposition not signed off", …], "gateId": "…" }
```

On pass it emits a `gate1` artifact (parents `[proposition, adr]`) — an auditable
record of the go decision.

### Who can run it
Anyone authed can *check* Gate 1; passing it requires the upstream sign-off
(`artifact:approve`) and ADR to already exist.

## Tips
- Gate 1 is a *check*, not a lock on the DB — but it is the discipline that keeps
  Make from starting on an unapproved proposition. Build should not proceed until
  Gate 1 is green.
