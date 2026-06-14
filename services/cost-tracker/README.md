# LLM Cost Tracker

One dashboard for LLM inference costs across all your applications, in near
real time.

Apps push small cost events to a central collector after every model turn;
the collector owns the datastore; the dashboard reads only from the
collector. Apps never block on the network, a collector outage loses
nothing, and duplicate deliveries can never double-count. The full design
rationale and decision record is in [PLAN.md](PLAN.md).

```
LLM app 1 ─┐  (tracker client: local spool + background flusher)
LLM app 2 ─┼──► Collector API ──► SQLite (WAL) ──► Dashboard UI
LLM app 3 ─┘    batched, idempotent ingest          filter by app/model/time
```

**Contents**
- [Quickstart](#quickstart)
- [Dashboard user guide](#dashboard-user-guide)
- [Integrating your app](#integrating-your-app) → full guide in [docs/INTEGRATION.md](docs/INTEGRATION.md)
- [Running in production](#running-in-production)
- [App registry, tokens, and authentication](#app-registry-tokens-and-authentication)
- [HTTP API reference](#http-api-reference)
- [Client library reference](#client-library-reference)
- [Configuration reference](#configuration-reference)
- [Repository layout](#repository-layout)
- [Troubleshooting](#troubleshooting)

---

## Quickstart

Requires Python 3.9+.

```bash
git clone <this-repo> && cd cost-tracker
python3 -m venv .venv
.venv/bin/pip install fastapi 'uvicorn[standard]' httpx pytest
.venv/bin/pip install -e ./client

# start the collector + dashboard
COST_TRACKER_DB=var/cost_tracker.db \
  .venv/bin/uvicorn server.app.main:app --host 0.0.0.0 --port 8787
```

Open http://127.0.0.1:8787 — the dashboard is empty until events arrive.
To explore with realistic data first:

```bash
.venv/bin/python scripts/seed_demo.py            # ~30 days of synthetic traffic
.venv/bin/python scripts/seed_demo.py --live     # optional: trickle live events
```

Run the test suite with `.venv/bin/python -m pytest tests/`.

---

## Dashboard user guide

The dashboard auto-refreshes every 5 seconds (it pauses while the tab is
hidden). All times are UTC. Everything on the page responds to the
controls in the header:

| Control | What it does |
|---|---|
| **24h / 7d / 30d / 90d / All** | Time range for the charts and tables. 24h and 7d use hourly buckets; longer ranges use daily buckets. |
| **By app / By model** | Whether the main chart stacks cost by application or by model. |
| **Apps ▾ / Models ▾** | Multi-select filters. Empty selection = everything. Filters apply to every card, chart, and table on the page. |

**Summary cards**
- *Today* — spend since midnight UTC, with a delta against yesterday *up to
  the same time of day* (a fair comparison, not partial-day vs full-day).
- *Last 7 / 30 days* — with deltas against the prior period. Deltas are
  hidden until enough history exists to make the comparison meaningful.
- *Burn rate* — spend in the last 60 minutes, expressed per hour. This is
  the "is something on fire right now" number.
- *Turns today* — event count and total tokens since midnight UTC.

**Charts**
- *Cost over time* — stacked bars per bucket; hover shows per-key cost and
  the bucket total. The subtitle shows the range total.
- *Cost by app / by model* — share of spend over the selected range.
- *Cumulative spend* — running total across the selected range; the slope
  is the burn rate, and steps reveal batch jobs.

**Tables**
- *Breakdown* — app × model rollup with turns, tokens, cost, and share of
  spend for the selected range.
- *Live feed* — the most recent turns as they arrive; new arrivals flash.

The green dot in the header pulses while the dashboard can reach the
collector and turns red if polling fails (it recovers automatically).
The **Admin** button opens the app registry and token management screen
(see [App registry, tokens, and authentication](#app-registry-tokens-and-authentication)).

---

## Integrating your app

Each app needs **one dependency, three env vars, and one call per turn**:

```bash
pip install "cost-tracker-client @ git+<this-repo-url>#subdirectory=client"
export COST_TRACKER_URL=http://costs.internal:8787
export COST_TRACKER_TOKEN=<per-app token>     # omit if auth not enabled
export COST_TRACKER_APP=my-app
```

```python
import cost_tracker

response = client.messages.create(...)
cost_tracker.track_usage(response.model, response.usage, session_id=conv_id)
```

That's the whole hot path. The step-by-step guide for app owners —
including streaming, agent loops, batch pipelines, apps that compute their
own cost, verification, and backfilling history — is
**[docs/INTEGRATION.md](docs/INTEGRATION.md)**.

**The fastest route:** copy [skills/cost-tracker-integration](skills/cost-tracker-integration/SKILL.md)
into your app repo's `.claude/skills/` and ask Claude Code to *"integrate
cost tracking"*. The skill performs the whole integration — call-site
discovery, configuration, verification, and backfill.

---

## Running in production

- **Process**: run the collector under your usual process manager
  (systemd, supervisor, a container) at a stable internal hostname, e.g.
  `costs.internal`. One instance is the intended topology — the collector
  is the single writer to the store.
- **Storage**: SQLite in WAL mode handles this workload comfortably
  (tens of millions of events). Set `COST_TRACKER_DB` to a path on local
  disk and back that file up. If you outgrow one box or want managed
  backups, port `server/app/db.py` to Postgres — the schema, API, and
  clients are unchanged.
- **Network**: cost events are ~300 bytes, batched (≤200/request by
  default), sent on keep-alive connections. Even 100k turns/day across
  all apps is ~30–40 MB/day total. Dashboard polling fetches small
  pre-aggregated stats, so its traffic is constant regardless of volume.
- **Resilience**: app-side spools (`~/.cost_tracker/spool/`) buffer events
  through collector restarts and network partitions, and drain
  automatically on recovery. Ingest dedupes on `event_id`, so redelivery
  is harmless.
- **TLS**: terminate at your usual internal proxy/ingress if your network
  policy requires it; the collector itself speaks plain HTTP.
- **Pricing table**: `client/cost_tracker/pricing.py` is the fallback used
  when an app reports only token counts. Update it when model pricing
  changes. Apps that compute and send their own `cost_usd` are unaffected.

---

## App registry, tokens, and authentication

**Apps do not need to be pre-configured.** In open mode (the default) an
app appears on the dashboard automatically the first time it sends an
event. Configuration only enters the picture when you want per-app auth.

### The admin screen

`/admin.html` (linked from the dashboard header) manages the app registry:

- **Add app** — registers a name and generates its ingest token
  (`sek_...`), shown once prominently and afterwards behind a Show/Copy
  control in the table.
- **Apps table** — every registered app *and* every app seen in stored
  events, with turn counts, last-seen, and total cost. Unregistered apps
  show a one-click **Register** button.
- **Rotate** — issues a new token; the old one stops working immediately
  (the app spools locally until it receives the new token, so no data is
  lost during the swap).
- **Edit** — per-app notes (ownership, contacts).
- **Remove** — unregisters the app and revokes its token; optionally also
  purges its stored events (separate, explicit confirmation).

Tokens issued in open mode are inert until enforcement is on, so you can
register your fleet first and flip auth on afterwards with no downtime.

### Enforcement

Enable ingest auth on the collector with:

```bash
export COST_TRACKER_AUTH=required
```

Once on:
- `POST /v1/events` requires `Authorization: Bearer <token>`; unknown
  tokens get 401.
- Each event's `app` field must match the token's app; mismatches are
  rejected (counted in the response, not stored). A leaked token can only
  write as its own app, and revoking one app never touches the others.
- Valid tokens come from the registry (admin screen) and, for backwards
  compatibility, from the static `COST_TRACKER_TOKENS="app:token,..."`
  env map (setting it also implies enforcement; such apps show as
  *env-managed* in the admin screen).

### Protecting the admin screen

Set `COST_TRACKER_ADMIN_TOKEN=<secret>` on the collector and the admin
endpoints (and screen) require it — the UI prompts once and keeps it for
the browser session. Without it, admin is open like the rest of the API.

Notes: ingest tokens are stored in plaintext in the collector's database
so the admin screen can re-display them — acceptable for an internal tool
where a token only grants write-as-this-app; protect the DB file
accordingly. Read/stats endpoints stay unauthenticated by design; front
the collector with your standard internal-auth proxy if you need to gate
the dashboard itself.

---

## HTTP API reference

All timestamps are UTC. Stats endpoints accept `apps=` and `models=`
(comma-separated) filters, and `from`/`to` as ISO 8601.

### `POST /v1/events`

Batch ingest (≤5000 events/request). Idempotent: an `event_id` already
stored is counted as a duplicate and skipped.

```json
{"events": [{
  "event_id": "uuid",
  "app": "support-bot",
  "model": "claude-sonnet-4-6",
  "ts": "2026-06-10T12:34:56Z",
  "input_tokens": 1234,
  "output_tokens": 567,
  "cache_read_tokens": 0,
  "cache_write_tokens": 0,
  "cost_usd": 0.0123,
  "session_id": "abc",
  "meta": {"feature": "summarize"}
}]}
```

Response: `{"accepted": n, "duplicates": n, "rejected": n}` (`rejected` =
app/token mismatches when auth is enabled). Validation failures return 422.

### `GET /v1/meta`
Apps, models, stored date range, total events and cost. The dashboard uses
it to build filters; integrators use it to confirm an app is reporting.

### `GET /v1/stats/cards`
Pre-computed summaries: today (and yesterday to the same time), last/prior
7d, last/prior 30d, last hour, with cost/events/tokens each.

### `GET /v1/stats/timeseries?from&to&bucket=hour|day&group_by=app|model|none`
Zero-filled buckets: `{"bucket": "day", "buckets": [...], "series":
[{"key", "values", "total", "events"}]}`. Hour buckets over ranges >14
days are coerced to day.

### `GET /v1/stats/breakdown?from&to`
App × model rollup: events, token sums, cost, share of total.

### `GET /v1/events/recent?limit=50`
Most recent events (by arrival), max 200 — feeds the live feed.

### `GET /healthz`
Liveness (checks the DB): `{"ok": true}`.

### Admin endpoints

All require `Authorization: Bearer <COST_TRACKER_ADMIN_TOKEN>` when that
variable is set. The admin screen (`/admin.html`) is a thin client over
these:

| Endpoint | Purpose |
|---|---|
| `GET /v1/admin/status` | auth mode, admin protection, env-managed apps |
| `GET /v1/admin/apps` | registry ∪ apps seen in events, with tokens and event stats |
| `POST /v1/admin/apps` `{"app", "note"?}` | register an app, generate its token (`201`; `409` if exists) |
| `PUT /v1/admin/apps/{app}` `{"note"}` | edit the note |
| `POST /v1/admin/apps/{app}/token` | rotate the token (old one revoked immediately) |
| `DELETE /v1/admin/apps/{app}?purge_events=bool` | unregister + revoke; optionally delete its events |

---

## Client library reference

```python
import cost_tracker
```

| Function | Purpose |
|---|---|
| `track_usage(model, usage, **kw)` | Record a turn straight from an Anthropic SDK response: reads `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` from `response.usage` (object or dict). |
| `track(model=, input_tokens=, output_tokens=, cache_read_tokens=, cache_write_tokens=, cost_usd=, session_id=, ts=, meta=, event_id=, app=)` | Record a turn explicitly. Omit `cost_usd` to have it estimated from the pricing table; pass it if your app computes cost itself (your number wins). `ts` (datetime or ISO string) defaults to now; pass the original turn time when recording after the fact. Pass a deterministic `event_id` when re-processing is possible. |
| `configure(url=, token=, app=, spool_dir=, flush_interval=, batch_size=)` | Replace the default tracker; otherwise it is built from env vars on first use. |
| `flush(timeout=10.0)` | Synchronously drain the spool; returns `True` when empty. Call before exit in short-lived scripts and batch jobs. Long-running servers don't need it. |
| `estimate_cost(model, input_tokens, output_tokens, cache_read_tokens=0, cache_write_tokens=0)` | The pricing-table estimate used as the fallback; `None` for unknown models. |

**Guarantees** — `track()`/`track_usage()`:
- never raise (failures log a `cost_tracker` warning and drop that event);
- never touch the network on the calling thread — they append one JSON
  line to a local spool file and return;
- survive collector outages: a daemon thread ships batches with
  exponential backoff and only advances past events the collector has
  acknowledged. Misconfigured URL/token therefore looks like a growing
  spool file, never an app error.

---

## Configuration reference

| Variable | Read by | Meaning | Default |
|---|---|---|---|
| `COST_TRACKER_URL` | client | collector base URL | unset → events spool locally |
| `COST_TRACKER_TOKEN` | client | per-app bearer token | unset |
| `COST_TRACKER_APP` | client | app name on the dashboard | `unknown` |
| `COST_TRACKER_SPOOL_DIR` | client | spool directory | `~/.cost_tracker/spool` |
| `COST_TRACKER_DB` | collector | SQLite file path | `./cost_tracker.db` |
| `COST_TRACKER_AUTH` | collector | `required` → enforce ingest tokens | unset → open mode |
| `COST_TRACKER_TOKENS` | collector | static `app:token,...` map (legacy; implies enforcement) | unset |
| `COST_TRACKER_ADMIN_TOKEN` | collector | protects `/admin.html` + admin API | unset → admin open |

---

## Repository layout

```
client/                 pip-installable cost_tracker package
  cost_tracker/client.py    spool + flusher + track()/track_usage()
  cost_tracker/pricing.py   fallback pricing table
server/
  app/                  FastAPI collector (ingest, stats, auth, SQLite store)
  static/               dashboard (vanilla JS + Chart.js)
scripts/
  seed_demo.py          synthetic demo traffic (+ --live trickle mode)
  backfill.py           import existing JSONL turn logs (idempotent)
skills/
  cost-tracker-integration/   Claude Code skill for app repos
docs/
  INTEGRATION.md        step-by-step integration guide for app owners
tests/                  pytest suite (ingest, stats, auth, client spool/retry)
PLAN.md                 architecture and decision record
```

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| App integrated but nothing on the dashboard | Env vars not in the process environment (a `.env` nothing loads is the classic). Check `~/.cost_tracker/spool/<app>.jsonl` — if it's growing, the client is recording but can't reach the collector: wrong `COST_TRACKER_URL` or token. |
| Spool file keeps growing | Collector unreachable from that host, or 401/403 (token wrong / app name mismatch). The client retries forever with backoff; fixing config drains it automatically. |
| Events arrive but costs look wrong | App sends only tokens and the pricing table is stale → update `client/cost_tracker/pricing.py`; or the app's own `cost_usd` is wrong at source. Raw token counts are stored, so history can be recomputed. |
| Duplicate-looking spend after a backfill re-run | Shouldn't happen — ingest dedupes on `event_id`. If it did, the importer generated random ids; use deterministic ids (`uuid5`) as `scripts/backfill.py` does. |
| Dashboard dot is red | Collector down or unreachable from your browser; the page retries every 5s. Check `GET /healthz`. |
| `422` on ingest | Event failed validation (negative tokens, missing field, >5000 events per batch). The client logs and drops poison batches rather than blocking the queue. |
| Delta missing on a summary card | Intentional: deltas hide until stored history fully covers the comparison window. |
