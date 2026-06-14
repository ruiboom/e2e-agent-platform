# 06 · Enterprise operations playbook (regulated organisations)

How to operate the Agent Platform inside a regulated organisation (banking,
insurance, healthcare, the public sector) — as a **controlled delivery system** for
AI agents, with the platform's gates, four-eyes governance, lineage and guardrails
acting as your control framework.

> **Read this first — maturity disclaimer.** The platform as built is
> *minimal-but-real*: the control *mechanisms* exist and are verified end-to-end,
> but several are deliberately lightweight (see [§11 Go-live hardening](#11-go-live-hardening-gate)).
> Nothing here asserts that the platform *is compliant* with any regime — compliance
> is your organisation's determination. Treat this as the operating model and the
> control catalogue you adopt, **and** the hardening backlog you must close before a
> genuinely regulated production workload runs on it.

---

## 1. Purpose, scope & audience

**Purpose.** Define the operating model, roles, control points, evidence and
runbooks for taking an AI agent from idea to regulated production and keeping it
under control.

**In scope:** any agent built and run on the platform (the 11-stage pipeline +
Academy). **Out of scope:** the modelling of the foundation LLMs themselves (these
are third-party; treat them as vendor/model-risk dependencies).

**Audience:** 1st-line delivery teams, 2nd-line risk & compliance (incl. Model Risk
Management, Data Protection, Information Security), 3rd-line internal audit, and
platform operations.

---

## 2. Control philosophy — three lines of defence

The platform's RBAC roles and gates are designed to enforce **segregation of
duties** across the three lines.

```mermaid
flowchart LR
  subgraph L1["1st line — Delivery"]
    C[contributor / steward]
  end
  subgraph L2["2nd line — Risk & Compliance"]
    A[approver / compliance_approver / taxonomy_manager]
  end
  subgraph L3["3rd line — Internal Audit"]
    AU[auditor — read-only over lineage + audit]
  end
  C -->|"produces artifacts"| A
  A -->|"signs off gates / approves knowledge"| C
  AU -. "independently inspects evidence" .-> C
  AU -. .-> A
```

- **1st line (build & own the risk):** `contributor`, `steward` — create projects,
  write artifacts, ingest knowledge, build agents.
- **2nd line (independent challenge & sign-off):** `approver`,
  `compliance_approver`, `taxonomy_manager` — sign off Gate 1, approve knowledge
  (four-eyes), own the eval gate thresholds, own taxonomy/classification.
- **3rd line (assurance):** a read-only `viewer` consuming the immutable lineage,
  audit events and evidence packs.
- **`admin`** is the platform operator — privileged, and itself subject to
  monitoring and least-privilege (see [§9](#9-access-management--segregation-of-duties)).

The non-negotiable rule the platform enforces today: **the actor who submits
knowledge cannot approve it** (four-eyes), and **the actor who builds cannot, by
role alone, sign off the governance gate**.

---

## 3. Regulatory & control mapping

The platform *supports and evidences* common requirements. It does not, by itself,
make you compliant. Map your specific obligations to these capabilities.

| Requirement area (examples) | Platform capability that supports it | Where |
|---|---|---|
| **AI governance / EU AI Act** (risk tiering, human oversight, technical documentation, logging) | Risk scoring at Discover; ADR + Gate 1 human sign-off; lineage as technical documentation; chat_log + eval_run as records of operation | Stages 1–5, lineage |
| **Model risk management** (SR 11-7, PRA SS1/23): independent validation, ongoing monitoring, effective challenge | Gate 2 eval (quality/latency/cost) as a validation gate owned by 2nd line; multi-persona test suite; Operate loop monitoring; champion/challenger via multiple `agent_version`s | Stages 7–11 |
| **Data protection** (GDPR/UK GDPR): data minimisation, purpose limitation, records of processing, DPIA | PII scan + redaction; provenance to the source revision; release pinning; canonical store as the record of knowledge | Ground, runtime guardrails |
| **Data lineage & quality** (BCBS 239) | Append-only artifact lineage + provenance tuple + content hashes | Lineage, Ground |
| **Operational resilience** (DORA, FCA/PRA): change control, incident management, exit/rollback | Versioned artifacts + rollback; gates as change control; incident runbooks (§10); kill switch | §9–§10 |
| **Information security** (ISO 27001, SOC 2) | RBAC, audit trail, prompt-injection guardrail, secrets isolation (server-side proxy) | Console, build-runtime |
| **AI management system** (ISO/IEC 42001) | The end-to-end controlled lifecycle + this playbook | Whole platform |

> **Use as evidence, not assurance.** Each row is something you can *point an
> examiner at*; the assessment of sufficiency is your 2nd/3rd line's.

---

## 4. The controlled delivery lifecycle

Each stage is a control point. An agent may not advance past a gate without the
required artifacts and approvals. Every output is an immutable, parent-linked
lineage artifact — your evidence.

| # | Stage | Control point | Required artifact(s) | Approval / role |
|---|---|---|---|---|
| 1 | Discover | Problem & risk scored | `opportunity` (feasibility + uncertainty) | 1st line |
| 2 | Define | Proposition signed off | `proposition` (status `signed_off`) | **2nd line** (`artifact:approve`) |
| 3 | Specify | Spec captured | `scope`, `system_prompt`, `kb_outline` | 1st line |
| 4 | Architect | Technical shape locked | `adr` (enum-validated) | 1st line, reviewed by 2nd |
| 5 | Plan | **Gate 1** | `gate1` (proposition signed off + ADR) | **2nd line go/no-go** |
| 6 | Ground | Knowledge governed | `kb_release` (approved-only) | **Four-eyes** (submitter ≠ approver) |
| 7 | Build | Agent produced | `agent_version` | 1st line |
| 8 | Test | Coverage proven | `test_suite` (multi-persona) | 1st line |
| 9 | Evaluate | **Gate 2** | `eval_run` + `gate2` (meets `pre_deploy_gates`) | **2nd line owns thresholds** |
| 10 | Deploy | Release authorised | `deployment` (Gate 2 enforced; guardrails on) | **2nd line + platform ops** |
| 11 | Operate | Controlled change | new `system_prompt` version (proposal) | 1st line proposes; re-enters gates |

**Golden rule:** *no deploy without a passing Gate 2*; *no release without
four-eyes approval*; *no Make without Gate 1*. These are enforced in code, not
just policy.

---

## 5. Control catalogue

The concrete, testable controls the platform provides. **Maturity:** ✅ enforced in
code · ⚙️ present but must be configured to your policy · 🔶 lightweight — harden
before regulated production (see §11).

| ID | Control | What it does | Evidence | Maturity |
|---|---|---|---|---|
| C-1 | **Segregation of duties (RBAC)** | 7 roles; build ≠ approve | role assignments; 403s in logs | ✅ (auth 🔶) |
| C-2 | **Four-eyes on knowledge** | approver ≠ submitter on every revision | `kb_revision.submitted_by/approved_by` | ✅ |
| C-3 | **Gate 1 — governance** | proposition signed off + ADR before Make | `gate1` artifact | ✅ |
| C-4 | **Gate 2 — pre-deploy validation** | quality/latency/cost thresholds before Deploy | `eval_run`, `gate2`, `policy_bundle.pre_deploy_gates` | ✅ (thresholds ⚙️) |
| C-5 | **Immutable lineage** | append-only, parent-linked artifacts; no in-place edits | `artifact`/`artifact_parent` | ✅ |
| C-6 | **Answer provenance** | every answer cites release + revision + chunk | provenance tuple in chat response | ✅ |
| C-7 | **Runtime guardrails** | injection blocked+escalated; PII redacted | `guardrails` in chat response | 🔶 (regex/heuristic) |
| C-8 | **Ingest safety scans** | PII/injection scan on every revision | `kb_revision.scan_results` | 🔶 |
| C-9 | **Cost accountability** | per-call tokens/cost/latency metered | cost-tracker dashboard | ✅ |
| C-10 | **Continuous monitoring** | every turn logged; weak turns flagged | `chat_log` | ✅ |
| C-11 | **Controlled change (Operate)** | improvements are *proposals*, never auto-promoted | new `system_prompt` version + rationale | ✅ |
| C-12 | **Policy bundle per project** | PII/injection/classification/risk + OPA + gates | `policy_bundle` | ⚙️ (OPA/risk 🔶) |
| C-13 | **Audit trail** | who/when on artifacts + transitions | `created_by`, timestamps | 🔶 (no hash-chain yet) |

Each control should have an **owner**, a **test of design** (does it exist) and a
**test of operating effectiveness** (does it work) — the `verify-m*` scripts are
your automated tests of operating effectiveness for C-2, C-3, C-4, C-6, C-7.

---

## 6. Risk management & model risk

**Use-case risk tiering (at Discover/Architect).** Classify each agent before
build. A practical tiering:

| Tier | Examples | Required controls |
|---|---|---|
| **Prohibited** | anything your policy forbids (e.g. autonomous financial decisions) | reject at Discover |
| **High** | customer-facing advice, anything touching eligibility/pricing | full pipeline + 2nd-line validation + human-in-the-loop + heightened monitoring |
| **Limited** | internal knowledge assistant over governed content | full pipeline, standard gates |
| **Minimal** | drafting aids over public content | lightweight, but still lineage + cost |

Record the tier on the `opportunity`/`adr` payload and let it drive the
`policy_bundle` (stricter `pre_deploy_gates`, mandatory human handoff for High).

**Model risk.** Treat the foundation model as a vendor dependency: record the
model id (it's on `agent_version.config` and every cost event), pin it, and re-run
Gate 2 on any model change. Gate 2 + the multi-persona suite are your **independent
validation**; the per-persona rollup is your **effective challenge** evidence.

**Feasibility.** Scored at Discover, *confirmed* at Architect. For high-uncertainty
cases, require a technical spike before Gate 1.

---

## 7. Data governance & privacy

- **Data minimisation & purpose limitation.** Ground only governs content a steward
  has ingested and an approver has signed off. Nothing is retrievable to an agent
  unless it is in an **approved** release.
- **PII.** Ingest scans for PII (`scan_results`); the runtime redacts PII from user
  input before it reaches the model or the logs (C-7/C-8). 🔶 *Harden:* replace the
  regex scanners with a validated detector (e.g. Presidio) and add output-side PII
  checks before regulated use.
- **Provenance & RoPA.** The provenance tuple ties every answer to a specific
  source revision; the canonical store + lineage are your record of what knowledge
  was processed and when.
- **Retention.** Define retention for `chat_log` (conversation data) and for
  superseded artifact versions. 🔶 *Configure:* the platform retains everything by
  default — add a retention/erasure job aligned to your policy and DSAR process.
- **DPIA trigger.** Any High-tier or customer-facing agent should trigger a DPIA;
  attach it as a `constraints`/`adr` reference before Gate 1.
- **Data residency.** 🔶 Confirm where Postgres, object storage and the model
  provider run before any non-local deploy; may constrain the deploy target.

---

## 8. Change management

Change on this platform is **versioned and gated by construction**:

- Every change is a **new artifact version** (immutable append). The prior version
  is retained — **rollback** is selecting an earlier `agent_version` / `kb_release`
  / `system_prompt`.
- **Standard change:** a new `agent_version` must pass Gate 2 before Deploy.
- **Knowledge change:** a new `kb_revision` requires four-eyes approval and a new
  pinned release before it reaches an agent.
- **Operate-driven change:** the Operate loop emits a *proposed* improved prompt; it
  **does not auto-promote**. It re-enters Specify→Build→Evaluate and must pass Gate 2
  again. This is your guardrail against silent drift.
- **Emergency change / rollback:** re-point a deployment to a prior `agent_version`;
  because nothing is destroyed, rollback is immediate and auditable.
- **Prompt registry change:** activating a prompt version is `admin`-only
  (`prompt:activate`) and is itself versioned (activate = roll forward/back).

---

## 9. Access management & segregation of duties

| Platform role | Typical org function | Line | Key capability |
|---|---|---|---|
| `viewer` | auditor, reviewer, stakeholder | 3rd | read-only |
| `contributor` | delivery engineer / conversation designer | 1st | `project:create`, `artifact:write` |
| `steward` | knowledge steward / product owner | 1st | write + approve knowledge |
| `approver` | risk / business approver | 2nd | `artifact:approve` (Gate 1, knowledge) |
| `compliance_approver` | compliance officer | 2nd | `artifact:approve` (compliance-flagged) |
| `taxonomy_manager` | data governance | 2nd | taxonomy / classification |
| `admin` | platform operations | ops | privileged; `prompt:activate` |

Operating rules:
- **Least privilege.** Grant the narrowest role; review quarterly (recertification).
- **No self-approval.** Enforced for knowledge (C-2); enforce by *process* for Gate 1
  (the signer must differ from the proposer).
- **Privileged access (`admin`).** Monitor admin actions; restrict prompt-registry
  changes to a named, logged owner.
- 🔶 **Harden before production:** the dev-stub login must be replaced with your
  **OIDC SSO + MFA**; the platform is built for this (swap `getSession()`, set
  `SESSION_PROVIDER=oidc`) but ships with a stub. Until then, treat the environment
  as non-production.

---

## 10. Operational resilience & incident management

Define RTO/RPO per agent tier. Runbooks for the incidents this platform is shaped to
handle:

| Incident | Detect | Respond | Evidence |
|---|---|---|---|
| **Bad answer / hallucination** | feedback widget, eval-on-live | trace via provenance tuple → the exact chunk; fix knowledge (re-ingest + approve + release) or rollback `agent_version` | provenance, `chat_log`, lineage |
| **Prompt-injection attempt** | runtime guardrail blocks + escalates | review escalations; tune injection patterns; notify security | `guardrails` block records |
| **PII exposure** | ingest scan / runtime redaction | contain, run DSAR/erasure, root-cause the source revision | `scan_results`, redaction counts |
| **Quality drift** | Operate diagnosis (flagged turns) | accept improvement proposal → re-gate → redeploy | `eval_run` trend, `chat_log` |
| **Cost runaway** | cost-tracker burn alerts | pause deployment; cap model/provider | cost-tracker |
| **Knowledge error** | steward/review | open a new revision; four-eyes; new release; supersede | `kb_revision` chain |

**Kill switch.** Pause a deployment (set status) to take an agent offline; because
the runtime checks the deployment, this stops serving without a code change.
🔶 *Harden:* add a hard per-agent disable enforced at the runtime entry point.

**Resilience.** Postgres is the single source of truth — back it up to your standard
(PITR). The platform services are stateless; the cost/feedback SQLite stores are
observability projections, not the system of record.

---

## 11. Go-live hardening gate

**Do not run a regulated production workload until these are closed.** Each is
isolated behind a seam, so closing it does not ripple across stages.

| Item | Why it matters for regulated use | Status |
|---|---|---|
| **OIDC SSO + MFA** (replace dev-stub auth) | identity, access control, non-repudiation | 🔶 seam ready |
| **Audit immutability** (hash-chained, WORM mirror) | tamper-evident evidence for examiners | 🔶 timestamps only |
| **Validated PII detection** (Presidio) + output-side checks | data protection effectiveness | 🔶 regex today |
| **OPA policy + risk classifier** in `policy_bundle` | enforce org policy at pre-authorize + final gate | 🔶 fields exist, not wired |
| **Real embedding model + graph store** (Neo4j/AGE) | retrieval quality = answer quality | 🔶 hash/entity placeholder |
| **Data residency & retention/erasure jobs** | GDPR, residency obligations | 🔶 configure |
| **Provider/data-processing agreements** for the LLM | vendor & model risk | org task |
| **Independent validation sign-off** (2nd line) of the eval methodology | model risk management | org task |
| **Pen test + threat model** of the deployed surface | infosec assurance | org task |
| **BCP/DR runbook + backups tested** | operational resilience | org task |

Adopt this table as a **go-live gate**: a High-tier agent is not authorised for
production until every applicable row is signed off.

---

## 12. Operating runbooks

### 12.1 Onboard a new use case
1. Create a project; assign an owner (1st line) and a 2nd-line approver.
2. Discover → score the opportunity; **assign a risk tier** (§6).
3. Define → proposition; 2nd line **signs off**.
4. Specify → scope/system_prompt/kb_outline. Architect → ADR (set retrieval + deploy
   target consistent with residency). Configure the project `policy_bundle`
   (`pre_deploy_gates`, runtime guards) to the tier.
5. **Gate 1** (2nd-line go/no-go). Record the `gate1` artifact.

### 12.2 Ground knowledge (four-eyes)
1. Steward ingests sources (docs/RSS/web) → revisions are **submitted** + scanned.
2. A **different** approver reviews `scan_results` + content and approves.
3. Steward pins a **release** (approved-only). The release is the agent's knowledge
   of record.

### 12.3 Build, prove & promote to production
1. Build the `agent_version` (paradigm + retrieval from the ADR).
2. Generate a multi-persona `test_suite`; run the eval → `eval_run`
   (quality/latency/cost + per-persona).
3. 2nd line sets/confirms `pre_deploy_gates`; check **Gate 2**.
4. If Gate 2 passes, **Deploy** (guardrails on, provenance on). Deploy is *blocked*
   otherwise. Record the `deployment` + `gate2` as the release evidence pack.

### 12.4 Periodic recertification (e.g. quarterly)
1. Re-run the eval against the current suite (and any new edge cases); confirm
   Gate 2 still passes (catch model/provider drift).
2. Review `chat_log` trends + feedback; run Operate; decide on improvement proposals.
3. Recertify access (RBAC) and the risk tier; refresh the DPIA if scope changed.

### 12.5 Decommission
1. Pause the deployment (kill switch). 2. Retain the lineage + evidence per your
   retention policy. 3. Apply retention/erasure to `chat_log`. 4. Record the
   decommission decision.

---

## 13. Evidence & audit pack

For any release, internal audit / an examiner can be handed a **self-contained
evidence pack** assembled from the lineage:

- The **lineage DAG** for the project (every artifact, version, parent, author,
  timestamp) — the full "how we got here".
- **Gate 1** and **Gate 2** records with the metrics that passed.
- The **knowledge release**: `item_revisions`, content hashes, and the
  submitter/approver on each (four-eyes evidence).
- The **eval_run**: quality/latency/cost + per-persona breakdown (validation).
- A sample of **chat_log** with **provenance tuples** (traceability of live answers).
- **Cost** records (accountability) and **guardrail** block/redaction records.

Because lineage is append-only and parent-linked, the pack is reproducible and
tamper-evident *in design* (🔶 add hash-chaining for tamper-*evidence in fact*).

---

## 14. Quick reference

- **Two hard gates:** Gate 1 (governance: proposition signed off + ADR) before
  Make; Gate 2 (validation: quality/latency/cost) before Deploy. Both enforced in
  code.
- **Two non-negotiable separations:** four-eyes on knowledge (C-2); build ≠ approve
  (C-1).
- **One question you can always answer:** *"why did the agent say this?"* — the
  provenance tuple → the exact governed source revision.
- **Before production:** close the [§11 hardening gate](#11-go-live-hardening-gate).

See also: [02 · Architecture](02-architecture.md), [03 · Data model](03-data-model.md),
[05 · Operations](05-operations.md), and the [stage guides](README.md#stage-user-guides).
