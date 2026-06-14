# Stage 1 · Discover — *Phase A: Shape & plan*

> Validate that a problem or opportunity is real and roughly feasible.

## What it does
Takes a free-text problem statement and produces a scored **opportunity** —
restated problem, supporting evidence with corroboration, market notes, and
feasibility/uncertainty scores (1–3). Rejected opportunities are recorded, not
deleted. This is the genesis artifact of the whole thread.

## How to use it

**Console** → open a project → **Shape & plan** → step *1 · Discover* → type the
problem → **Discover**.

**API**
```bash
curl -b jar -X POST localhost:3000/api/shape -H 'Content-Type: application/json' \
  -d '{"action":"discover","projectId":"<PID>",
       "problem":"Customers struggle to understand overdraft fees"}'
```

Under the hood the console calls the model-router prompt `discover.opportunity`
and writes the result as an `opportunity` artifact.

## Reads / Writes
- **Reads:** the project (and, conceptually, any raw sources you've grounded).
- **Writes:** `opportunity` → `{problem, evidence[], marketNotes, feasibilityScore, uncertaintyScore, status}`, parents `[]` (genesis).

## Who can run it
`artifact:write` — contributor, steward, admin.

## Tips
- Keep feasibility a *score* here; it becomes a *confirmation* at Architect.
- One project can hold several opportunities (each a separate artifact); only the
  latest flows into Define.

## Deferred
Production Discover adds external-input signal analysis (clustering + ≥2-source
corroboration) and a research-pack generator with a QA gate.
