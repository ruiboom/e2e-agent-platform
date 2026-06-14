"""Collector API + dashboard host.

Run from the repo root:
    .venv/bin/uvicorn server.app.main:app --host 0.0.0.0 --port 8788
"""

import json
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .auth import admin_guard, auth_required, authenticate, env_token_map
from .db import get_conn
from .schemas import FeedbackBatch, FeedbackPatch, derive_sentiment

app = FastAPI(title="User Feedback Tracker", version="0.1.0")

# The browser widget posts cross-origin from app UIs. Ingest is write-only and
# keyed, so a permissive allowlist is fine; per-app origin enforcement is a
# phase-4 concern (origins are recorded in the registry for that).
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=False,
                   allow_methods=["*"], allow_headers=["*"])

FMT = "%Y-%m-%d %H:%M:%S"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _parse_dt(value: Optional[str], default: Optional[datetime]) -> Optional[datetime]:
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


def _fts_query(q: Optional[str]) -> str:
    """Turn raw user input into a safe FTS5 MATCH string: each whitespace-split
    term becomes a quoted prefix token, so arbitrary punctuation can't produce a
    syntax error. Returns '' when there's nothing to search."""
    terms = [t for t in re.split(r"\s+", (q or "").strip()) if t]
    return " ".join('"%s"*' % t.replace('"', '""') for t in terms[:20])


def _feedback_where(frm=None, to=None, apps=None, kinds=None,
                    sentiments=None, statuses=None, q=None):
    clauses, params = [], []
    if frm is not None:
        clauses.append("ts >= ?")
        params.append(frm.strftime(FMT))
    if to is not None:
        clauses.append("ts < ?")
        params.append(to.strftime(FMT))
    for col, vals in (("app", apps), ("kind", kinds),
                      ("sentiment", sentiments), ("status", statuses)):
        if vals:
            clauses.append("%s IN (%s)" % (col, ",".join("?" * len(vals))))
            params += vals
    fq = _fts_query(q)
    if fq:
        clauses.append(
            "rowid IN (SELECT rowid FROM feedback_fts WHERE feedback_fts MATCH ?)")
        params.append(fq)
    return (" AND ".join(clauses) or "1=1"), params


def _row_to_item(r):
    d = dict(r)
    d["meta"] = json.loads(d["meta"]) if d.get("meta") else None
    d["tags"] = json.loads(d["tags"]) if d.get("tags") else []
    return d


# ----------------------------------------------------------------------
# ingest

@app.post("/v1/feedback")
def ingest(batch: FeedbackBatch, caller_app: Optional[str] = Depends(authenticate)):
    conn = get_conn()
    now = _utcnow().strftime(FMT)
    accepted = duplicates = rejected = 0
    with conn:
        for it in batch.items:
            if caller_app is not None and it.app != caller_app:
                rejected += 1
                continue
            sentiment = it.sentiment or derive_sentiment(it.kind, it.rating)
            cur = conn.execute(
                "INSERT OR IGNORE INTO feedback "
                "(feedback_id, app, ts, received_at, kind, rating, sentiment, "
                " text, user_id, session_id, meta) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (it.feedback_id, it.app, it.ts_utc(), now, it.kind, it.rating,
                 sentiment, it.text, it.user_id, it.session_id,
                 json.dumps(it.meta, sort_keys=True) if it.meta else None))
            if cur.rowcount:
                accepted += 1
            else:
                duplicates += 1
    return {"accepted": accepted, "duplicates": duplicates, "rejected": rejected}


# ----------------------------------------------------------------------
# explorer: search / filter / read / triage

@app.get("/v1/feedback")
def list_feedback(from_: Optional[str] = Query(None, alias="from"),
                  to: Optional[str] = None, apps: Optional[str] = None,
                  kinds: Optional[str] = None, sentiments: Optional[str] = None,
                  statuses: Optional[str] = None, q: Optional[str] = None,
                  limit: int = 50, offset: int = 0):
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    where, params = _feedback_where(
        _parse_dt(from_, None), _parse_dt(to, None),
        _csv(apps), _csv(kinds), _csv(sentiments), _csv(statuses), q)
    conn = get_conn()
    total = conn.execute(
        f"SELECT COUNT(*) n FROM feedback WHERE {where}", params).fetchone()["n"]
    rows = conn.execute(
        f"SELECT * FROM feedback WHERE {where} "
        f"ORDER BY ts DESC, rowid DESC LIMIT ? OFFSET ?",
        params + [limit, offset]).fetchall()
    return {"total": total, "limit": limit, "offset": offset,
            "items": [_row_to_item(r) for r in rows]}


@app.get("/v1/feedback/recent")
def recent(limit: int = 50, apps: Optional[str] = None, kinds: Optional[str] = None,
           sentiments: Optional[str] = None, statuses: Optional[str] = None):
    limit = max(1, min(limit, 200))
    where, params = _feedback_where(
        None, None, _csv(apps), _csv(kinds), _csv(sentiments), _csv(statuses), None)
    rows = get_conn().execute(
        f"SELECT * FROM feedback WHERE {where} "
        f"ORDER BY received_at DESC, rowid DESC LIMIT ?", params + [limit]).fetchall()
    return {"items": [_row_to_item(r) for r in rows]}


@app.get("/v1/feedback/{feedback_id}")
def get_feedback(feedback_id: str):
    row = get_conn().execute(
        "SELECT * FROM feedback WHERE feedback_id = ?", (feedback_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="feedback not found")
    return _row_to_item(row)


@app.patch("/v1/feedback/{feedback_id}")
def patch_feedback(feedback_id: str, body: FeedbackPatch, _=Depends(admin_guard)):
    fields = body.model_dump(exclude_unset=True)
    sets, params = [], []
    if "status" in fields:
        sets.append("status = ?")
        params.append(fields["status"])
    if "tags" in fields:
        sets.append("tags = ?")
        params.append(json.dumps(fields["tags"]) if fields["tags"] is not None else None)
    if "note" in fields:
        sets.append("note = ?")
        params.append(fields["note"])
    if not sets:
        raise HTTPException(status_code=400, detail="no fields to update")
    conn = get_conn()
    with conn:
        cur = conn.execute(
            f"UPDATE feedback SET {', '.join(sets)} WHERE feedback_id = ?",
            params + [feedback_id])
    if not cur.rowcount:
        raise HTTPException(status_code=404, detail="feedback not found")
    row = conn.execute(
        "SELECT * FROM feedback WHERE feedback_id = ?", (feedback_id,)).fetchone()
    return _row_to_item(row)


# ----------------------------------------------------------------------
# stats

@app.get("/v1/meta")
def meta():
    conn = get_conn()
    one = lambda sql: [r[0] for r in conn.execute(sql)]
    apps = one("SELECT DISTINCT app FROM feedback ORDER BY app")
    kinds = one("SELECT DISTINCT kind FROM feedback ORDER BY kind")
    sentiments = one("SELECT DISTINCT sentiment FROM feedback "
                     "WHERE sentiment IS NOT NULL ORDER BY sentiment")
    statuses = one("SELECT DISTINCT status FROM feedback ORDER BY status")
    tagset = set()
    for (raw,) in conn.execute("SELECT tags FROM feedback WHERE tags IS NOT NULL"):
        try:
            tagset.update(json.loads(raw))
        except (ValueError, TypeError):
            pass
    row = conn.execute(
        "SELECT MIN(ts) lo, MAX(ts) hi, COUNT(*) n FROM feedback").fetchone()
    return {"apps": apps, "kinds": kinds, "sentiments": sentiments,
            "statuses": statuses, "tags": sorted(tagset),
            "min_ts": row["lo"], "max_ts": row["hi"], "total_items": row["n"]}


@app.get("/v1/stats/cards")
def cards(apps: Optional[str] = None, kinds: Optional[str] = None,
          sentiments: Optional[str] = None, statuses: Optional[str] = None,
          q: Optional[str] = None):
    a, k, s, st = _csv(apps), _csv(kinds), _csv(sentiments), _csv(statuses)
    conn = get_conn()
    now = _utcnow()
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    day = timedelta(days=1)

    def span(frm, to):
        where, params = _feedback_where(frm, to, a, k, s, st, q)
        n = conn.execute(
            f"SELECT COUNT(*) n FROM feedback WHERE {where}", params).fetchone()["n"]
        return {"count": n}

    # NPS / CSAT / sentiment headline over the last 30 days, honouring filters.
    bw, bp = _feedback_where(now - 30 * day, now, a, k, s, st, q)
    nps = conn.execute(
        f"SELECT COALESCE(SUM(rating>=9),0) prom, COALESCE(SUM(rating BETWEEN 7 AND 8),0) pass, "
        f"COALESCE(SUM(rating<=6),0) det, COUNT(*) n FROM feedback "
        f"WHERE {bw} AND kind='nps' AND rating IS NOT NULL", bp).fetchone()
    nps_n = nps["n"] or 0
    nps_score = round((nps["prom"] - nps["det"]) / nps_n * 100) if nps_n else None
    csat = conn.execute(
        f"SELECT AVG(rating) avg, COUNT(*) n FROM feedback "
        f"WHERE {bw} AND kind='csat' AND rating IS NOT NULL", bp).fetchone()
    sent_rows = conn.execute(
        f"SELECT COALESCE(sentiment,'unknown') s, COUNT(*) n FROM feedback "
        f"WHERE {bw} GROUP BY s", bp).fetchall()
    sent = {r["s"]: r["n"] for r in sent_rows}
    untriaged = conn.execute(
        "SELECT COUNT(*) n FROM feedback WHERE status='new'").fetchone()["n"]

    return {
        "today": span(midnight, now),
        "yesterday_same_time": span(midnight - day, now - day),
        "last_7d": span(now - 7 * day, now),
        "prior_7d": span(now - 14 * day, now - 7 * day),
        "last_30d": span(now - 30 * day, now),
        "prior_30d": span(now - 60 * day, now - 30 * day),
        "nps": {"score": nps_score, "responses": nps_n,
                "promoters": nps["prom"], "passives": nps["pass"],
                "detractors": nps["det"]},
        "csat": {"avg": round(csat["avg"], 2) if csat["avg"] is not None else None,
                 "responses": csat["n"] or 0},
        "sentiment": {"positive": sent.get("positive", 0),
                      "neutral": sent.get("neutral", 0),
                      "negative": sent.get("negative", 0),
                      "unknown": sent.get("unknown", 0)},
        "untriaged": {"count": untriaged},
        "as_of": now.strftime(FMT),
    }


@app.get("/v1/stats/timeseries")
def timeseries(from_: Optional[str] = Query(None, alias="from"),
               to: Optional[str] = None, bucket: str = "day",
               group_by: str = "none", apps: Optional[str] = None,
               kinds: Optional[str] = None, sentiments: Optional[str] = None,
               statuses: Optional[str] = None, q: Optional[str] = None):
    if bucket not in ("hour", "day"):
        raise HTTPException(status_code=400, detail="bucket must be hour|day")
    if group_by not in ("app", "sentiment", "kind", "none"):
        raise HTTPException(status_code=400, detail="group_by must be app|sentiment|kind|none")
    now = _utcnow()
    frm = _parse_dt(from_, now - timedelta(days=30))
    end = _parse_dt(to, now)
    if end <= frm:
        raise HTTPException(status_code=400, detail="to must be after from")
    if bucket == "hour" and (end - frm) > timedelta(days=14):
        bucket = "day"

    bexpr = "strftime('%Y-%m-%dT%H:00', ts)" if bucket == "hour" else "date(ts)"
    if group_by == "none":
        kexpr = "'total'"
    elif group_by == "sentiment":
        kexpr = "COALESCE(sentiment,'unknown')"
    else:
        kexpr = group_by  # app | kind
    where, params = _feedback_where(frm, end, _csv(apps), _csv(kinds),
                                    _csv(sentiments), _csv(statuses), q)
    rows = get_conn().execute(
        f"SELECT {bexpr} b, {kexpr} k, COUNT(*) c FROM feedback "
        f"WHERE {where} GROUP BY b, k", params).fetchall()

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

    series, totals = {}, {}
    for r in rows:
        key = r["k"]
        vals = series.setdefault(key, [0] * len(labels))
        i = index.get(r["b"])
        if i is not None:
            vals[i] = r["c"]
        totals[key] = totals.get(key, 0) + r["c"]
    ordered = sorted(series, key=lambda key: -totals[key])
    return {"bucket": bucket, "buckets": labels,
            "series": [{"key": key, "values": series[key], "total": totals[key]}
                       for key in ordered]}


@app.get("/v1/stats/breakdown")
def breakdown(from_: Optional[str] = Query(None, alias="from"),
              to: Optional[str] = None, apps: Optional[str] = None,
              kinds: Optional[str] = None, sentiments: Optional[str] = None,
              statuses: Optional[str] = None, q: Optional[str] = None):
    now = _utcnow()
    frm = _parse_dt(from_, now - timedelta(days=30))
    end = _parse_dt(to, now)
    where, params = _feedback_where(frm, end, _csv(apps), _csv(kinds),
                                    _csv(sentiments), _csv(statuses), q)
    rows = get_conn().execute(
        f"SELECT app, kind, COUNT(*) n, "
        f"COALESCE(SUM(sentiment='positive'),0) pos, "
        f"COALESCE(SUM(sentiment='neutral'),0) neu, "
        f"COALESCE(SUM(sentiment='negative'),0) neg, AVG(rating) avg_rating "
        f"FROM feedback WHERE {where} GROUP BY app, kind ORDER BY n DESC",
        params).fetchall()
    total = sum(r["n"] for r in rows)
    return {"total": total,
            "rows": [{"app": r["app"], "kind": r["kind"], "count": r["n"],
                      "positive": r["pos"], "neutral": r["neu"], "negative": r["neg"],
                      "avg_rating": round(r["avg_rating"], 2) if r["avg_rating"] is not None else None,
                      "share": round(r["n"] / total, 4) if total else 0}
                     for r in rows]}


@app.get("/healthz")
def healthz():
    get_conn().execute("SELECT 1")
    return {"ok": True}


# ----------------------------------------------------------------------
# admin: app registry + keys (UI at /admin.html)

_APP_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")


class AppCreate(BaseModel):
    app: str = Field(min_length=1, max_length=64)
    note: Optional[str] = Field(None, max_length=256)
    origins: Optional[List[str]] = None


class AppUpdate(BaseModel):
    note: Optional[str] = Field(None, max_length=256)
    origins: Optional[List[str]] = None


def _new_secret() -> str:
    return "sek_" + secrets.token_urlsafe(24)


def _new_publishable() -> str:
    return "pk_" + secrets.token_urlsafe(18)


@app.get("/v1/admin/status")
def admin_status(_=Depends(admin_guard)):
    return {"auth_required": auth_required(),
            "admin_protected": bool(os.environ.get("FEEDBACK_TRACKER_ADMIN_TOKEN")),
            "env_managed_apps": sorted(set(env_token_map().values()))}


@app.get("/v1/admin/apps")
def admin_list_apps(_=Depends(admin_guard)):
    conn = get_conn()
    registered = {r["app"]: r for r in conn.execute("SELECT * FROM apps")}
    stats = {r["app"]: r for r in conn.execute(
        "SELECT app, COUNT(*) n, MAX(ts) last_ts FROM feedback GROUP BY app")}
    env_apps = set(env_token_map().values())
    apps = []
    for name in sorted(set(registered) | set(stats) | env_apps):
        reg, st = registered.get(name), stats.get(name)
        apps.append({
            "app": name,
            "registered": reg is not None,
            "env_managed": name in env_apps,
            "secret_token": reg["secret_token"] if reg else None,
            "publishable_key": reg["publishable_key"] if reg else None,
            "origins": json.loads(reg["origins"]) if reg and reg["origins"] else [],
            "note": reg["note"] if reg else None,
            "created_at": reg["created_at"] if reg else None,
            "token_rotated_at": reg["token_rotated_at"] if reg else None,
            "items": st["n"] if st else 0,
            "last_seen": st["last_ts"] if st else None,
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
    secret, publishable = _new_secret(), _new_publishable()
    with conn:
        conn.execute(
            "INSERT INTO apps (app, secret_token, publishable_key, origins, note, created_at) "
            "VALUES (?,?,?,?,?,?)",
            (body.app, secret, publishable,
             json.dumps(body.origins) if body.origins else None,
             body.note, _utcnow().strftime(FMT)))
    return {"app": body.app, "secret_token": secret, "publishable_key": publishable}


@app.put("/v1/admin/apps/{app_name}")
def admin_update_app(app_name: str, body: AppUpdate, _=Depends(admin_guard)):
    fields = body.model_dump(exclude_unset=True)
    sets, params = [], []
    if "note" in fields:
        sets.append("note = ?")
        params.append(fields["note"])
    if "origins" in fields:
        sets.append("origins = ?")
        params.append(json.dumps(fields["origins"]) if fields["origins"] else None)
    if not sets:
        raise HTTPException(status_code=400, detail="no fields to update")
    conn = get_conn()
    with conn:
        cur = conn.execute(f"UPDATE apps SET {', '.join(sets)} WHERE app = ?",
                           params + [app_name])
    if not cur.rowcount:
        raise HTTPException(status_code=404, detail="app not registered")
    return {"app": app_name, **fields}


@app.post("/v1/admin/apps/{app_name}/token")
def admin_rotate_secret(app_name: str, _=Depends(admin_guard)):
    secret = _new_secret()
    conn = get_conn()
    with conn:
        cur = conn.execute(
            "UPDATE apps SET secret_token = ?, token_rotated_at = ? WHERE app = ?",
            (secret, _utcnow().strftime(FMT), app_name))
    if not cur.rowcount:
        raise HTTPException(status_code=404, detail="app not registered")
    return {"app": app_name, "secret_token": secret}


@app.post("/v1/admin/apps/{app_name}/publishable")
def admin_rotate_publishable(app_name: str, _=Depends(admin_guard)):
    publishable = _new_publishable()
    conn = get_conn()
    with conn:
        cur = conn.execute(
            "UPDATE apps SET publishable_key = ?, token_rotated_at = ? WHERE app = ?",
            (publishable, _utcnow().strftime(FMT), app_name))
    if not cur.rowcount:
        raise HTTPException(status_code=404, detail="app not registered")
    return {"app": app_name, "publishable_key": publishable}


@app.delete("/v1/admin/apps/{app_name}")
def admin_remove_app(app_name: str, purge_items: bool = False, _=Depends(admin_guard)):
    conn = get_conn()
    items_deleted = 0
    with conn:
        cur = conn.execute("DELETE FROM apps WHERE app = ?", (app_name,))
        removed = bool(cur.rowcount)
        if purge_items:
            items_deleted = conn.execute(
                "DELETE FROM feedback WHERE app = ?", (app_name,)).rowcount
    if not removed and not items_deleted:
        raise HTTPException(status_code=404, detail="app not found")
    return {"app": app_name, "removed": removed, "items_deleted": items_deleted}


# the browser widget, served from the client package so the collector can hand
# apps a ready-to-embed <script src="<collector>/widget/feedback-widget.js">
_widget = Path(__file__).resolve().parents[2] / "client" / "widget"
if _widget.is_dir():
    app.mount("/widget", StaticFiles(directory=str(_widget)), name="widget")

# static dashboard — mounted last so API routes win
_static = Path(__file__).resolve().parent.parent / "static"
app.mount("/", StaticFiles(directory=str(_static), html=True), name="dashboard")
