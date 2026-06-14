# User Feedback Tracker

One place to collect, store, and explore the feedback your users submit through
the UIs of all your applications — in near real time.

Apps push small feedback events to a central collector the moment a user submits;
the collector owns the datastore; the dashboard reads only from the collector.
The host app never blocks, a collector outage loses nothing, and a
double-clicked submit can never double-count. This is the sibling of
[cost-tracker](../cost-tracker) — same architecture, built so the two can later
merge. The full design rationale and decision record is in [PLAN.md](PLAN.md).

```
App UI (widget) ─┐  (localStorage queue + retry)
App backend ─────┼──► Collector API ──► SQLite (WAL + FTS5) ──► Dashboard / explorer
reviews/tickets ─┘    batched, idempotent ingest                search · filter · triage
   (server SDK: disk spool + flusher)
```

**Contents**
- [Quickstart](#quickstart)
- [Dashboard user guide](#dashboard-user-guide)
- [Adding feedback to your app](#adding-feedback-to-your-app) → full guide in [docs/INTEGRATION.md](docs/INTEGRATION.md)
- [App registry, keys, and authentication](#app-registry-keys-and-authentication)
- [HTTP API reference](#http-api-reference)
- [Client surfaces](#client-surfaces)
- [Configuration reference](#configuration-reference)
- [Repository layout](#repository-layout)
- [Troubleshooting](#troubleshooting)

---

## Quickstart

Requires Python 3.9+.

```bash
git clone <this-repo> && cd feedback-tracker
python3 -m venv .venv
.venv/bin/pip install fastapi 'uvicorn[standard]' httpx pytest
.venv/bin/pip install -e ./client

# start the collector + dashboard
FEEDBACK_TRACKER_DB=var/feedback_tracker.db \
  .venv/bin/uvicorn server.app.main:app --host 0.0.0.0 --port 8788
```

Open http://127.0.0.1:8788 — the dashboard is empty until feedback arrives.
To explore with realistic data first:

```bash
.venv/bin/python scripts/seed_demo.py            # ~30 days of synthetic feedback
.venv/bin/python scripts/seed_demo.py --live     # optional: trickle live feedback
```

Then try the embeddable widget yourself at http://127.0.0.1:8788/widget/demo.html.

Run the test suite with `.venv/bin/python -m pytest tests/`.

---

## Dashboard user guide

The dashboard auto-refreshes every 5 seconds (it pauses while the tab is hidden).
All times are UTC. Everything responds to the header controls:

| Control | What it does |
|---|---|
| **Search** | Full-text search across feedback comments (prefix-matched). |
| **24h / 7d / 30d / 90d / All** | Time range for charts and tables. 24h/7d use hourly buckets; longer ranges use daily. |
| **Sentiment / App / Kind** | What the main chart stacks by. |
| **Apps / Sentiment / Kind / Status ▾** | Multi-select filters. Empty = everything. They apply to every card, chart, and the Explorer. |

**Insight cards** — feedback volume today / last 7d / last 30d (with deltas
against the prior period), the 30-day **NPS** and **CSAT** averages, and a
**Needs triage** count (items still in status `new` — the "what needs attention
now" number).

**Charts** — *Feedback over time* (stacked bars, by sentiment / app / kind) and
share donuts *by sentiment*, *by app*, and *by kind*.

**Explorer** (the centerpiece) — a searchable, filterable, paginated list of
individual feedback items: the comment up front, with a sentiment badge, rating,
app, kind, status, and context (page). Click **Triage** on any item to set its
status (`new → triaged → resolved → archived`), add tags, and leave an internal
note — without leaving the page.

**Breakdown** — app × kind rollup with counts, positive/negative split, average
rating, and share for the selected range.

The green dot in the header pulses while the dashboard can reach the collector
and turns red if polling fails (it recovers automatically). The **Admin** button
opens the app registry and key management screen.

---

## Adding feedback to your app

Two paths, same endpoint and schema — use either or both.

**Browser widget (the common path)** — one tag, embedded where it loads on every
page:

```html
<script src="http://feedback.internal:8788/widget/feedback-widget.js"
        data-app="support-bot"
        data-collector-url="http://feedback.internal:8788"
        data-key="pk_..."></script>     <!-- publishable key; omit in open mode -->
```

A floating **Feedback** button appears; submissions queue in `localStorage` and
retry until acknowledged.

**Server SDK** — for feedback you forward from a backend:

```bash
pip install "feedback-tracker-client @ git+<this-repo-url>#subdirectory=client"
export FEEDBACK_TRACKER_URL=http://feedback.internal:8788
export FEEDBACK_TRACKER_TOKEN=sek_...    # secret token; omit in open mode
export FEEDBACK_TRACKER_APP=support-bot
```

```python
import feedback_tracker
feedback_tracker.submit(kind="csat", rating=5, text="Love it", session_id=sid)
```

The step-by-step guide — widget config, context, CSP, the server SDK, and
backfilling history — is **[docs/INTEGRATION.md](docs/INTEGRATION.md)**.

**The fastest route:** copy [skills/feedback-tracker-integration](skills/feedback-tracker-integration/SKILL.md)
into your app repo's `.claude/skills/` and ask Claude Code to *"add the feedback
widget"*. The skill performs the whole integration — stack detection, embed,
context, verification, and backfill.

---

## App registry, keys, and authentication

**Apps do not need to be pre-configured.** In open mode (the default) an app
appears on the dashboard automatically the first time it sends feedback.
Configuration only enters the picture when you want per-app auth.

`/admin.html` (linked from the dashboard header) manages the registry. Each
registered app gets **two keys**:

- a **publishable key** (`pk_…`) — safe to embed in a browser widget; it can only
  write feedback as that app (no reads, no admin).
- a **secret token** (`sek_…`) — for the server SDK (and, with an admin token,
  admin). Never ship it to a browser.

Add an app to generate both; the screen shows them once and hands you a
ready-to-paste widget snippet. Rotate either key independently; the old one stops
working immediately (clients queue locally until they get the new one). Apps seen
in stored feedback but not yet registered show a one-click **Register**.

**Enforcement.** `export FEEDBACK_TRACKER_AUTH=required` makes `POST /v1/feedback`
require a valid key, and each item's `app` must match the key's app (mismatches
are rejected, not stored). Keys issued in open mode are inert until you flip this
on, so you can register your fleet first.

**Protecting admin & triage.** Set `FEEDBACK_TRACKER_ADMIN_TOKEN=<secret>` and the
admin endpoints **and the triage `PATCH`** require it — the UI prompts once and
keeps it for the browser session. Without it, admin/triage is open like the rest
of the API.

Notes: keys are stored in plaintext so the admin screen can re-display them —
acceptable for an internal tool where a key only grants write-as-this-app; protect
the DB file accordingly. **Read/stats/explorer endpoints are unauthenticated by
design and expose raw user comments — front the collector with your standard
internal-auth proxy.** See "Privacy & moderation" in [PLAN.md](PLAN.md).

---

## HTTP API reference

All timestamps are UTC. Stats/list endpoints accept `apps`, `kinds`,
`sentiments`, `statuses` (comma-separated) and `q` (full-text) filters, and
`from`/`to` as ISO 8601.

### `POST /v1/feedback`
Batch ingest (≤5000 items/request). Idempotent: a `feedback_id` already stored is
counted as a duplicate and skipped. Body: `{"items": [ <feedback event>, … ]}`
(see the schema in [docs/INTEGRATION.md](docs/INTEGRATION.md)). Response:
`{"accepted": n, "duplicates": n, "rejected": n}` (`rejected` = app/key mismatch
when auth is on). Validation failures return 422.

### `GET /v1/feedback?from&to&apps&kinds&sentiments&statuses&q&limit&offset`
The explorer query: filter + full-text search + pagination. Returns
`{"total", "limit", "offset", "items": [...]}`.

### `GET /v1/feedback/{id}` · `PATCH /v1/feedback/{id}`
Fetch one item; or triage it — `{"status"?, "tags"?, "note"?}`. `PATCH` requires
the admin token when one is set.

### `GET /v1/feedback/recent?limit=50`
Most recent items by arrival (max 200) — feeds the live view.

### `GET /v1/meta`
Apps, kinds, sentiments, statuses, tags, stored date range, total items. The
dashboard builds its filters from this.

### `GET /v1/stats/cards`
Volume today (and yesterday to the same time), last/prior 7d and 30d, plus 30-day
NPS, CSAT, the sentiment split, and the untriaged count.

### `GET /v1/stats/timeseries?from&to&bucket=hour|day&group_by=app|sentiment|kind|none`
Zero-filled buckets of item counts. Hour buckets over ranges >14 days are coerced
to day.

### `GET /v1/stats/breakdown?from&to`
App × kind rollup: count, positive/neutral/negative split, average rating, share.

### `GET /healthz`
Liveness (checks the DB): `{"ok": true}`.

### Admin endpoints
All require `Authorization: Bearer <FEEDBACK_TRACKER_ADMIN_TOKEN>` when set.

| Endpoint | Purpose |
|---|---|
| `GET /v1/admin/status` | auth mode, admin protection, env-managed apps |
| `GET /v1/admin/apps` | registry ∪ apps seen in feedback, with keys and stats |
| `POST /v1/admin/apps` `{"app","note"?,"origins"?}` | register an app, generate both keys (`201`; `409` if exists) |
| `PUT /v1/admin/apps/{app}` `{"note"?,"origins"?}` | edit note / CORS origins |
| `POST /v1/admin/apps/{app}/token` | rotate the **secret** token |
| `POST /v1/admin/apps/{app}/publishable` | rotate the **publishable** key |
| `DELETE /v1/admin/apps/{app}?purge_items=bool` | unregister; optionally delete its feedback |

---

## Client surfaces

**Browser widget** (`client/widget/feedback-widget.js`, served at
`/widget/feedback-widget.js`): a dependency-free floating button + form, or a
programmatic `FeedbackWidget.submit({...})`. Queues to `localStorage` and retries;
never loses a submission to a transient outage.

**Server SDK** (`feedback_tracker`, `pip install -e ./client`):

| Function | Purpose |
|---|---|
| `submit(kind=, rating=, sentiment=, text=, user_id=, session_id=, ts=, meta=, app=, feedback_id=)` | Record one item. Omit `sentiment` to derive it from `kind`+`rating`; omit `feedback_id` to auto-generate. Pass `ts` + a deterministic `feedback_id` when importing after the fact. |
| `configure(url=, token=, app=, spool_dir=, flush_interval=, batch_size=)` | Replace the default tracker; otherwise built from env vars on first use. |
| `flush(timeout=10.0)` | Synchronously drain the spool. Call before exit in short-lived scripts. |
| `derive_sentiment(kind, rating)` | The same rule the collector uses. |

**Guarantees** (both surfaces): never block the host app, never lose data to an
unreachable collector (disk spool / `localStorage` queue, drained on recovery),
and ingest dedupes on `feedback_id` so retries are safe.

---

## Configuration reference

| Variable | Read by | Meaning | Default |
|---|---|---|---|
| `FEEDBACK_TRACKER_URL` | SDK | collector base URL | unset → spools locally |
| `FEEDBACK_TRACKER_TOKEN` | SDK | per-app secret token (`sek_…`) | unset |
| `FEEDBACK_TRACKER_APP` | SDK | app name reported with each item | `unknown` |
| `FEEDBACK_TRACKER_SPOOL_DIR` | SDK | spool directory | `~/.feedback_tracker/spool` |
| `FEEDBACK_TRACKER_DB` | collector | SQLite file path | `./feedback_tracker.db` |
| `FEEDBACK_TRACKER_AUTH` | collector | `required` → enforce ingest keys | unset → open mode |
| `FEEDBACK_TRACKER_TOKENS` | collector | static `app:token,…` map (legacy; implies enforcement) | unset |
| `FEEDBACK_TRACKER_ADMIN_TOKEN` | collector | protects `/admin.html`, admin API, and triage `PATCH` | unset → open |

---

## Repository layout

```
client/
  feedback_tracker/   pip-installable server SDK (spool + flusher + submit())
  widget/             browser widget (localStorage queue + retry) + demo.html
server/
  app/                FastAPI collector (ingest, search, stats, triage, auth, SQLite+FTS5)
  static/             dashboard + explorer (vanilla JS + Chart.js)
scripts/
  seed_demo.py        synthetic feedback (+ --live trickle mode)
  backfill.py         import existing feedback (tickets, reviews, surveys); idempotent
skills/
  feedback-tracker-integration/   Claude Code skill: embed the widget in one prompt
docs/
  INTEGRATION.md      step-by-step integration guide for app owners
tests/                pytest suite (ingest, search, stats, triage, auth, client retry)
PLAN.md               architecture and decision record
CLAUDE.md             working guidance + the cost-tracker relationship
```

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Widget embedded but nothing on the dashboard | Open devtools: a growing `feedback_tracker_queue` in `localStorage` = recorded but can't reach the collector (URL/key/CORS). A CSP can block it — allow the collector origin in `connect-src`. No queue + no request = the script isn't loading. |
| SDK integrated but nothing arrives | Env vars not in the process environment (a `.env` nothing loads is the classic). Check `~/.feedback_tracker/spool/<app>.jsonl` — growing means it's recording but can't reach the collector. |
| Search finds nothing for a word that's clearly there | Search is prefix-matched per term; very short/partial terms over-match, full words under-match if misspelled. Punctuation is ignored (it can't error). |
| Sentiment is blank on free-text items | Intentional — sentiment is only derived from unambiguous signals (thumb/NPS/CSAT/bug/praise). Free-text classification is a later, async enrichment. |
| Triage `PATCH` returns 401 | `FEEDBACK_TRACKER_ADMIN_TOKEN` is set; the dashboard prompts for it once per browser session. |
| Duplicate-looking feedback after a backfill re-run | Shouldn't happen — ingest dedupes on `feedback_id`. Use deterministic ids (`uuid5`) as `scripts/backfill.py` does. |
| Dashboard dot is red | Collector down or unreachable from your browser; the page retries every 5s. Check `GET /healthz`. |
