# 07 · Production hardening

The platform shipped *minimal-but-real*; this pass builds the **production depth**
called out in the [architecture deferred table](02-architecture.md#deferred-depth)
and the [playbook's go-live gate](06-enterprise-playbook.md#11-go-live-hardening-gate).
Nine hardening workstreams (**H1–H9**), each real and verified.

Run them all: `bash scripts/verify-hardening.sh` (47 assertions).

| # | Hardening | What changed | Verify |
|---|---|---|---|
| **H1** | **Tamper-evident audit** | `audit_event` hash-chain + WORM trigger; both lineage clients (TS + Python, identical digest) append on `artifact.create`, Ground on `knowledge.approve` — one global chain. `verifyAuditChain` + `GET /api/audit/verify`. | `verify-h-audit` (6) |
| **H2** | **Policy engine + risk classifier** | `governance/policy.py` deny-rules evaluator over `policy_bundle.opa_rules`; `governance/risk.py` tiers an agent (high/limited/minimal). Gate 2 is now policy-aware (classifies risk, evaluates rules alongside quality/latency/cost). | `verify-h-policy` (6) |
| **H3** | **Retention + DSAR** | Subject-attributed `chat_log` (user_id); `lib/data-rights.ts` purge / export / erase; `/api/admin/retention` + `/api/admin/dsar` gated by `data:admin`; every action audited. | `verify-h-retention` (6) |
| **H4** | **Validated PII (Presidio)** | Presidio NER (PERSON/LOCATION/CREDIT_CARD/…) merged with checksum-validated regex (card Luhn, IBAN mod-97); falls back to regex if absent (`pii_engine()`). Output-side DLP redacts PII the model emits before it leaves / is logged. | `verify-h-pii` (7) |
| **H5** | **Real embeddings** | `py/providers` uses **BAAI/bge-small-en-v1.5** via fastembed (384-dim, semantic retrieval); hash fallback (`embed_engine()`). | `verify-h-embed` (4) |
| **H6** | **Real OIDC auth** | `lib/oidc.ts` verifies an RS256 JWT against the IdP's JWKS (issuer/audience/expiry) and maps a role claim to RBAC; coexists with the dev-stub. `scripts/oidc-test-issuer.mjs` is a local IdP for testing. | `verify-h-oidc` (6) |
| **H7** | **Neo4j graph store + enricher** | `neo4j:5` container; `ground/app/graph.py` LLM-extracts entities + relationships into Neo4j; graph + graph_hybrid retrieval traverse it (lookup ∪ 1-hop), with the in-Postgres entity index as fallback. | `verify-h-graph` (5) |
| **H8** | **Real LangGraph runtime** | `langgraph_runtime.py` runs a compiled LangGraph StateGraph (retrieve→generate) for the `langgraph` paradigm; other paradigms use the inline runtime (shared `rag.py` steps). | `verify-h-langgraph` (3) |
| **H9** | **GitHub connector** | Ground `kind=github` fetches a public repo's docs (README / paths) via the GitHub API into the governed canonical store. | `verify-h-github` (4) |

## Control maturity after hardening

Maturity flags from the [control catalogue](06-enterprise-playbook.md#5-control-catalogue):

| Control | Before | After |
|---|---|---|
| C-7 runtime guardrails (PII/injection) | 🔶 regex | ✅ Presidio + validated regex + output DLP |
| C-8 ingest safety scans | 🔶 | ✅ Presidio-backed |
| C-12 policy bundle (OPA + risk) | ⚙️/🔶 | ✅ policy engine + risk classifier wired to Gate 2 |
| C-13 audit trail | 🔶 timestamps | ✅ hash-chained, WORM, tamper-evident |
| auth | 🔶 dev-stub | ✅ OIDC path (dev-stub still available for local) |
| retrieval quality | 🔶 hash embed | ✅ real semantic model |
| data lifecycle | 🔶 retain-all | ✅ retention purge + DSAR export/erase |

## Still deferred (needs external infrastructure or is production *breadth*)

These require external accounts or are runtime/connector breadth rather than
go-live controls:

- **Real cloud deploy targets** (Vercel/GCP/Azure/Watson/Dialogflow/LivePerson) — need cloud credentials; the `deployment` artifact + guardrail policy model the release.
- **ADK / flexi / VCBL runtimes** — the `langgraph` paradigm now runs a real graph (H8); the other paradigms remain config over the shared RAG runtime.
- **Confluence-Jira / STT connectors** — need provider credentials (GitHub, RSS, web are built).
- **Spine stores → Postgres** — cost/feedback run on SQLite (observability projections, not the system of record).

## Dependencies added by hardening

- Python: `presidio-analyzer` + `en_core_web_sm` (H4), `fastembed` (H5),
  `neo4j` (H7), `langgraph` (H8) — real deps; the optional ones degrade gracefully.
- TS: `jose` (H6) for JWT/JWKS verification.
- Infra: a `neo4j:5` container (H7).

## Re-embedding note (H5)

Switching the embedder changes the vector space. Chunks embedded by the old hash
function are inconsistent with bge queries; **new ingests** use the active engine.
A production switch should rebuild the pgvector projection (re-embed existing
`kb_chunk` rows) — a projection rebuild, not a schema change (both are 384-dim).
