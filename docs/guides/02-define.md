# Stage 2 · Define — *Phase A: Shape & plan*

> Turn a validated opportunity into a crisp, feasible **proposition** — and sign it off.

## What it does
Reads the latest `opportunity` and produces a `proposition`: target user, need,
capabilities, success metrics, tone-of-voice direction, and feasibility +
compliance pre-checks. The proposition starts in `status: draft`. **Signing off**
creates a new proposition version with `status: signed_off` — this is one of the
two conditions for **Gate 1**.

Sign-off is an *immutable append* (a new version), so the draft and signed-off
records both survive in the lineage.

## How to use it

**Console** → **Shape & plan** → step *2 · Define* → **Define proposition**, then
**Sign off** (requires an approver role).

**API**
```bash
curl -b jar -X POST localhost:3000/api/shape \
  -d '{"action":"define","projectId":"<PID>"}'      # draft
curl -b approver_jar -X POST localhost:3000/api/shape \
  -d '{"action":"signoff","projectId":"<PID>"}'     # signed_off
```

## Reads / Writes
- **Reads:** latest `opportunity`.
- **Writes:** `proposition` (draft) parent `[opportunity]`; sign-off writes
  `proposition` (signed_off) parent `[the draft proposition]`.

## Who can run it
- Define (draft): `artifact:write` — contributor, steward, admin.
- **Sign off:** `artifact:approve` — approver, steward, admin, compliance_approver.
  (A pure contributor cannot sign off — separation of duties.)

## Tips
- Specify will automatically link its `scope` to the **signed-off** proposition,
  so do the sign-off before (or it links to nothing and `scope` is a genesis node).
- Gate 1 stays blocked until both sign-off **and** an ADR exist (see Plan + Gate 1).
