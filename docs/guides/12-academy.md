# Academy — per-stage enablement

> The second product on the backbone: contextual help for all 11 stages and
> completable role paths, sharing the console shell, auth and design system.

## What it does
Academy maps **1:1 to the 11 pipeline stages** and **reads live from the
platform** — each stage's help card shows a `live` / `down` badge driven by the
actual service's health check, so the docs never drift from the product. It also
offers **role paths** (curated stage sequences) that a learner completes step by
step, with per-user progress.

## How to use it

**Console** → top nav → **Academy**. You'll see:
- The 11 stages grouped by phase (Shape & plan / Make / Prove / Run & improve),
  each with a how-it-works blurb and a live status badge.
- A live summary: *N/11 stages live · M/5 services up · K projects*.
- **Role paths** — mark each stage complete; the path shows `path complete` when
  all its stages are done.

**API**
```bash
curl -b jar localhost:3000/api/academy/status
# → { stages:11, liveStages, services:{router,ground,build,eval,optimise}, projects }

curl -b jar -X POST localhost:3000/api/academy/progress \
  -d '{"path":"conversation-designer","stageId":"specify"}'
# → { path, done:[…], complete }
```

## Role paths

| Path | Stages |
|---|---|
| **Conversation Designer** | Specify → Build → Test |
| **Knowledge Engineer** | Architect → Ground → Evaluate |
| **Platform Operator** | Deploy → Operate → Evaluate |

## Reads / Writes
- **Reads:** live service health + the lineage (project count); the enablement map
  (`apps/console/lib/enablement.ts`).
- **Writes:** `academy_progress(user_id, role_path, stage_id, completed_at)`.

## Tips
- Because each stage card is tied to a real service, Academy doubles as a quick
  platform **health view**: if a stage shows `down`, that service isn't running.
- A stage outside a path is rejected — progress is scoped to the path's stages.

## Deferred
Production Academy generalises a course player (A-level-revision: progress, ranks,
AI-marking), imports the static courses (prompt design, workflow design,
knowledgebases, openclaw) preserving their localStorage namespaces, and adds the
facilitated workshop and graded accounts.
