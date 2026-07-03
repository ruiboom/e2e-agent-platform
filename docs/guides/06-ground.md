# Stage 6 · Ground — *Phase B: Make* — the knowledge kernel

> One canonical, governed source of truth, exposed six ways, pinned into releases.

## What it does
Ground is the kernel. It **ingests** content (typed docs, or via RSS/web
connectors), runs **safety scans**, stores immutable **revisions** in a
**submitted** state, requires a *different* actor to **approve** (four-eyes),
chunks + embeds approved content into a pgvector projection (plus tsvector and an
entity index), and **pins a release** that an agent consumes. Retrieval offers
**six modes**, selectable per `agent_version`.

The canonical store is the only source of truth; vector/lexical/graph indexes are
rebuildable projections over it.

## How to use it (console)

**Project → Knowledge** (`/ground`) is the full governed flow on one page:

1. **Point at sources & ingest** — four source tabs: **Paste text** (markdown
   headings become chunks), **Web page**, **RSS feed**, **GitHub repo**
   (`owner/name`, optional paths; defaults to the README). Set *Submitted by*
   and **Ingest** — each document lands as an immutable, safety-scanned revision
   in the **submitted** state.
2. **Review & approve** — every item shows its state, revision, chunk count,
   submitter and scan findings. **Expand an item to read the full document
   rendered** (markdown), and **Edit document** to re-ingest it as the next
   revision — which goes back through four-eyes. Approving needs
   `artifact:approve` *and a different user than the submitter*.
3. **Cut a release** — pins the latest **approved** revision of every item and
   enriches the graph. The `release_key` is what Build consumes.

## How to use it (API / scripts)

```bash
# 1. ingest (submitter = "bob")
curl -X POST localhost:8790/v1/ingest -H 'Content-Type: application/json' -d '{
  "project_id":"<PID>","submitted_by":"bob",
  "docs":[{"uri":"doc/overdraft","title":"Overdrafts",
           "body":"# Overdraft fees\n\nWe charge 39.9% EAR variable..."}]}'
# → { items:[{ item_id, revision_id, state:"submitted", chunks }] }

# 1b. or pull from a connector (inline content, a live url, or a GitHub repo)
curl -X POST localhost:8790/v1/connect -d '{"project_id":"<PID>","kind":"rss","content":"<rss>…</rss>"}'
curl -X POST localhost:8790/v1/connect -d '{"project_id":"<PID>","kind":"github","url":"octocat/Hello-World"}'

# 2. four-eyes approve (approver MUST differ from submitter)
curl -X POST localhost:8790/v1/approve -d '{"revision_id":"<RID>","approver":"alice"}'

# 3. pin a release (links to the kb_outline artifact)
curl -X POST localhost:8790/v1/release -d '{"project_id":"<PID>","kb_outline_artifact_id":"<KBOUT>"}'
# → { release_key, kb_release_artifact_id, item_count }

# 4. retrieve in any mode
curl -X POST localhost:8790/v1/retrieve -d '{
  "project_id":"<PID>","release_key":"kb-…","query":"overdraft fee","k":3,"mode":"hybrid"}'
```

## The six retrieval modes

| Mode | How it ranks |
|---|---|
| `vector` | pgvector cosine over chunk embeddings |
| `lexical` | Postgres `tsvector` / `ts_rank` full-text |
| `hybrid` | Reciprocal-Rank Fusion of vector + lexical |
| `graph` | overlap with a chunk's entity index (significant tokens) |
| `graph_hybrid` | RRF of vector + graph |

Each chunk comes back with its provenance: `{item_id, revision_id, chunk_id}`.

## Governance (four-eyes)
- Ingest creates a **submitted** revision with `scan_results` (PII + injection scan).
- `approve` rejects (`400`) if the approver equals the submitter.
- `release` snapshots **only approved** revisions — unapproved content is never
  retrievable through a release.

## Reads / Writes
- **Reads:** project sources; the `kb_outline` artifact (release links to it).
- **Writes:** canonical `kb_item`/`kb_revision`/`kb_chunk`/`kb_chunk_entity`; a
  `kb_release` row; and a `kb_release` **artifact** (parent `[kb_outline]`).

## Tips
- A release with no approved revisions is empty → retrieval returns nothing → chat
  answers carry null provenance. Approve before releasing.
- Re-ingesting unchanged content is a no-op (content-hash gate).
- Editing a document (console **Edit document**, or re-ingesting the same `uri`
  with a new body) creates the **next revision** of the same item — the old
  revision stays immutable, and a release keeps serving whatever it pinned until
  you cut a new one.

## Deferred
Production Ground is the full KMS: state-machine governance, schema-registry,
time-travel + canary releases, Neo4j/AGE graph + graph-enricher, and connectors
for GitHub, Confluence/Jira, STT/audio and broadened OCR.
