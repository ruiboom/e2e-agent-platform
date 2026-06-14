"""Collector API + dashboard host.

Run from the repo root:
    .venv/bin/uvicorn server.app.main:app --host 0.0.0.0 --port 8787
"""

import json
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .auth import admin_guard, auth_required, authenticate, env_token_map
from .db import get_conn
from .schemas import EventBatch

app = FastAPI(title="LLM Cost Tracker", version="0.1.0")

FMT = "%Y-%m-%d %H:%M:%S"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _parse_dt(value: Optional[str], default: datetime) -> datetime:
    if not value:
        return default
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail=f"invalid datetime: {value}")
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _csv(value: Optional[str]):
    return [v.strip() for v in value.split(",") if v.strip()] if value else []


def _where(frm: datetime, to: datetime, apps, models):
    clauses = ["ts >= ? AND ts < ?"]
    params = [frm.strftime(FMT), to.strftime(FMT)]
    if apps:
        clauses.append("app IN (%s)" % ",".join("?" * len(apps)))
        params += apps
    if models:
        clauses.append("model IN (%s)" % ",".join("?" * len(models)))
        params += models
    return " AND ".join(clauses), params


# ----------------------------------------------------------------------
# ingest

@app.post("/v1/events")
def ingest(batch: EventBatch, caller_app: Optional[str] = Depends(authenticate)):
    conn = get_conn()
    now = _utcnow().strftime(FMT)
    accepted = duplicates = rejected = 0
    with conn:
        for e in batch.events:
            if caller_app is not None and e.app != caller_app:
                rejected += 1
                continue
            cur = conn.execute(
                "INSERT OR IGNORE INTO events VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                (e.event_id, e.app, e.model, e.ts_utc(), now,
                 e.input_tokens, e.output_tokens,
                 e.cache_read_tokens, e.cache_write_tokens,
                 e.cost_usd, e.session_id,
                 json.dumps(e.meta, sort_keys=True) if e.meta else None))
            if cur.rowcount:
                accepted += 1
            else:
                duplicates += 1
    return {"accepted": accepted, "duplicates": duplicates, "rejected": rejected}


# ----------------------------------------------------------------------
# stats

@app.get("/v1/meta")
def meta():
    conn = get_conn()
    apps = [r[0] for r in conn.execute("SELECT DISTINCT app FROM events ORDER BY app")]
    models = [r[0] for r in conn.execute("SELECT DISTINCT model FROM events ORDER BY model")]
    row = conn.execute(
        "SELECT MIN(ts) lo, MAX(ts) hi, COUNT(*) n, COALESCE(SUM(cost_usd),0) c "
        "FROM events").fetchone()
    return {"apps": apps, "models": models, "min_ts": row["lo"], "max_ts": row["hi"],
            "total_events": row["n"], "total_cost": round(row["c"], 4)}


@app.get("/v1/stats/cards")
def cards(apps: Optional[str] = None, models: Optional[str] = None):
    a, m = _csv(apps), _csv(models)
    conn = get_conn()
    now = _utcnow()
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)

    def span(frm, to):
        where, params = _where(frm, to, a, m)
        row = conn.execute(
            f"SELECT COALESCE(SUM(cost_usd),0) c, COUNT(*) n, "
            f"COALESCE(SUM(input_tokens+output_tokens),0) t "
            f"FROM events WHERE {where}", params).fetchone()
        return {"cost": round(row["c"], 4), "events": row["n"], "tokens": row["t"]}

    day = timedelta(days=1)
    return {
        "today": span(midnight, now),
        # yesterday up to the same time of day, for a fair delta
        "yesterday_same_time": span(midnight - day, now - day),
        "yesterday_full": span(midnight - day, midnight),
        "last_7d": span(now - 7 * day, now),
        "prior_7d": span(now - 14 * day, now - 7 * day),
        "last_30d": span(now - 30 * day, now),
        "prior_30d": span(now - 60 * day, now - 30 * day),
        "last_hour": span(now - timedelta(hours=1), now),
        "as_of": now.strftime(FMT),
    }


@app.get("/v1/stats/timeseries")
def timeseries(from_: Optional[str] = Query(None, alias="from"),
               to: Optional[str] = None,
               bucket: str = "day", group_by: str = "none",
               apps: Optional[str] = None, models: Optional[str] = None):
    if bucket not in ("hour", "day"):
        raise HTTPException(status_code=400, detail="bucket must be hour|day")
    if group_by not in ("app", "model", "none"):
        raise HTTPException(status_code=400, detail="group_by must be app|model|none")
    now = _utcnow()
    frm = _parse_dt(from_, now - timedelta(days=30))
    end = _parse_dt(to, now)
    if end <= frm:
        raise HTTPException(status_code=400, detail="to must be after from")
    if bucket == "hour" and (end - frm) > timedelta(days=14):
        bucket = "day"  # keep bucket counts sane

    bexpr = "strftime('%Y-%m-%dT%H:00', ts)" if bucket == "hour" else "date(ts)"
    kexpr = group_by if group_by in ("app", "model") else "'total'"
    where, params = _where(frm, end, _csv(apps), _csv(models))
    rows = get_conn().execute(
        f"SELECT {bexpr} b, {kexpr} k, SUM(cost_usd) c, COUNT(*) n "
        f"FROM events WHERE {where} GROUP BY b, k", params).fetchall()

    labels = []
    if bucket == "hour":
        cur, step = frm.replace(minute=0, second=0, microsecond=0), timedelta(hours=1)
        label = lambda d: d.strftime("%Y-%m-%dT%H:00")
    else:
        cur, step = frm.replace(hour=0, minute=0, second=0, microsecond=0), timedelta(days=1)
        label = lambda d: d.strftime("%Y-%m-%d")
    while cur < end:
        labels.append(label(cur))
        cur += step
    index = {lbl: i for i, lbl in enumerate(labels)}

    series, totals, counts = {}, {}, {}
    for r in rows:
        key = r["k"]
        vals = series.setdefault(key, [0.0] * len(labels))
        i = index.get(r["b"])
        if i is not None:
            vals[i] = round(r["c"], 6)
        totals[key] = totals.get(key, 0.0) + r["c"]
        counts[key] = counts.get(key, 0) + r["n"]
    ordered = sorted(series, key=lambda k: -totals[k])
    return {"bucket": bucket, "buckets": labels,
            "series": [{"key": k, "values": series[k],
                        "total": round(totals[k], 4), "events": counts[k]}
                       for k in ordered]}


@app.get("/v1/stats/breakdown")
def breakdown(from_: Optional[str] = Query(None, alias="from"),
              to: Optional[str] = None,
              apps: Optional[str] = None, models: Optional[str] = None):
    now = _utcnow()
    frm = _parse_dt(from_, now - timedelta(days=30))
    end = _parse_dt(to, now)
    where, params = _where(frm, end, _csv(apps), _csv(models))
    rows = get_conn().execute(
        f"SELECT app, model, COUNT(*) n, SUM(input_tokens) it, SUM(output_tokens) ot, "
        f"SUM(cache_read_tokens) crt, SUM(cache_write_tokens) cwt, SUM(cost_usd) c "
        f"FROM events WHERE {where} GROUP BY app, model ORDER BY c DESC",
        params).fetchall()
    total = sum(r["c"] for r in rows)
    return {"total_cost": round(total, 4),
            "rows": [{"app": r["app"], "model": r["model"], "events": r["n"],
                      "input_tokens": r["it"], "output_tokens": r["ot"],
                      "cache_read_tokens": r["crt"], "cache_write_tokens": r["cwt"],
                      "cost": round(r["c"], 4),
                      "share": round(r["c"] / total, 4) if total else 0}
                     for r in rows]}


@app.get("/v1/events/recent")
def recent(limit: int = 50, apps: Optional[str] = None, models: Optional[str] = None):
    limit = max(1, min(limit, 200))
    a, m = _csv(apps), _csv(models)
    clauses, params = ["1=1"], []
    if a:
        clauses.append("app IN (%s)" % ",".join("?" * len(a)))
        params += a
    if m:
        clauses.append("model IN (%s)" % ",".join("?" * len(m)))
        params += m
    rows = get_conn().execute(
        f"SELECT app, model, ts, input_tokens, output_tokens, cost_usd, session_id "
        f"FROM events WHERE {' AND '.join(clauses)} "
        f"ORDER BY received_at DESC, rowid DESC LIMIT ?", params + [limit]).fetchall()
    return {"events": [dict(r) for r in rows]}


@app.get("/healthz")
def healthz():
    get_conn().execute("SELECT 1")
    return {"ok": True}


# ----------------------------------------------------------------------
# admin: app registry + tokens (UI at /admin.html)

_APP_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")


class AppCreate(BaseModel):
    app: str = Field(min_length=1, max_length=64)
    note: Optional[str] = Field(None, max_length=256)


class AppUpdate(BaseModel):
    note: Optional[str] = Field(None, max_length=256)


def _new_token() -> str:
    return "sek_" + secrets.token_urlsafe(24)


@app.get("/v1/admin/status")
def admin_status(_=Depends(admin_guard)):
    return {"auth_required": auth_required(),
            "admin_protected": bool(os.environ.get("COST_TRACKER_ADMIN_TOKEN")),
            "env_managed_apps": sorted(set(env_token_map().values()))}


@app.get("/v1/admin/apps")
def admin_list_apps(_=Depends(admin_guard)):
    conn = get_conn()
    registered = {r["app"]: r for r in conn.execute("SELECT * FROM apps")}
    stats = {r["app"]: r for r in conn.execute(
        "SELECT app, COUNT(*) n, MAX(ts) last_ts, "
        "COALESCE(SUM(cost_usd),0) c FROM events GROUP BY app")}
    env_apps = set(env_token_map().values())
    apps = []
    for name in sorted(set(registered) | set(stats) | env_apps):
        reg, st = registered.get(name), stats.get(name)
        apps.append({
            "app": name,
            "registered": reg is not None,
            "env_managed": name in env_apps,
            "token": reg["token"] if reg else None,
            "note": reg["note"] if reg else None,
            "created_at": reg["created_at"] if reg else None,
            "token_rotated_at": reg["token_rotated_at"] if reg else None,
            "events": st["n"] if st else 0,
            "last_seen": st["last_ts"] if st else None,
            "total_cost": round(st["c"], 4) if st else 0.0,
        })
    return {"auth_required": auth_required(), "apps": apps}


@app.post("/v1/admin/apps", status_code=201)
def admin_create_app(body: AppCreate, _=Depends(admin_guard)):
    if not _APP_NAME.match(body.app):
        raise HTTPException(status_code=400,
                            detail="app name must match [A-Za-z0-9][A-Za-z0-9._-]{0,63}")
    conn = get_conn()
    if conn.execute("SELECT 1 FROM apps WHERE app = ?", (body.app,)).fetchone():
        raise HTTPException(status_code=409, detail="app already registered")
    token = _new_token()
    with conn:
        conn.execute(
            "INSERT INTO apps (app, token, note, created_at) VALUES (?,?,?,?)",
            (body.app, token, body.note, _utcnow().strftime(FMT)))
    return {"app": body.app, "token": token}


@app.put("/v1/admin/apps/{app_name}")
def admin_update_app(app_name: str, body: AppUpdate, _=Depends(admin_guard)):
    conn = get_conn()
    with conn:
        cur = conn.execute("UPDATE apps SET note = ? WHERE app = ?",
                           (body.note, app_name))
    if not cur.rowcount:
        raise HTTPException(status_code=404, detail="app not registered")
    return {"app": app_name, "note": body.note}


@app.post("/v1/admin/apps/{app_name}/token")
def admin_rotate_token(app_name: str, _=Depends(admin_guard)):
    token = _new_token()
    conn = get_conn()
    with conn:
        cur = conn.execute(
            "UPDATE apps SET token = ?, token_rotated_at = ? WHERE app = ?",
            (token, _utcnow().strftime(FMT), app_name))
    if not cur.rowcount:
        raise HTTPException(status_code=404, detail="app not registered")
    return {"app": app_name, "token": token}


@app.delete("/v1/admin/apps/{app_name}")
def admin_remove_app(app_name: str, purge_events: bool = False,
                     _=Depends(admin_guard)):
    conn = get_conn()
    events_deleted = 0
    with conn:
        cur = conn.execute("DELETE FROM apps WHERE app = ?", (app_name,))
        removed = bool(cur.rowcount)
        if purge_events:
            events_deleted = conn.execute(
                "DELETE FROM events WHERE app = ?", (app_name,)).rowcount
    if not removed and not events_deleted:
        raise HTTPException(status_code=404, detail="app not found")
    return {"app": app_name, "removed": removed,
            "events_deleted": events_deleted}


# static dashboard — mounted last so API routes win
_static = Path(__file__).resolve().parent.parent / "static"
app.mount("/", StaticFiles(directory=str(_static), html=True), name="dashboard")
