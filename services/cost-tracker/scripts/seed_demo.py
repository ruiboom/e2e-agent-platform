"""Seed the collector with realistic synthetic cost events.

Generates ~30 days of traffic for four demo apps with diurnal and weekday
patterns, then POSTs it through the real ingest API (so the whole pipeline
is exercised). Event ids are deterministic, so re-running is idempotent.

Usage:
    python scripts/seed_demo.py [--days 30] [--url http://127.0.0.1:8787]
    python scripts/seed_demo.py --live          # trickle live events forever
"""

import argparse
import random
import time
import uuid
from datetime import datetime, timedelta, timezone

import httpx

from cost_tracker.pricing import estimate_cost

NAMESPACE = uuid.uuid5(uuid.NAMESPACE_DNS, "cost-tracker-demo")

# app -> (models with weights, turns/day range, token profile, diurnal profile)
APPS = {
    "support-bot": {
        "models": [("claude-sonnet-4-6", 0.7), ("claude-haiku-4-5", 0.3)],
        "turns_per_day": (380, 680),
        "in_tokens": (900, 2600), "out_tokens": (150, 700),
        "cache_read": (0, 3000),
        "profile": "business",
    },
    "doc-search": {
        "models": [("claude-haiku-4-5", 1.0)],
        "turns_per_day": (800, 1500),
        "in_tokens": (400, 1600), "out_tokens": (60, 350),
        "cache_read": (0, 0),
        "profile": "flat",
    },
    "code-assistant": {
        "models": [("claude-opus-4-8", 0.55), ("claude-sonnet-4-6", 0.45)],
        "turns_per_day": (140, 320),
        "in_tokens": (2500, 9000), "out_tokens": (600, 3200),
        "cache_read": (0, 12000),
        "profile": "business",
    },
    "meeting-notes": {
        "models": [("claude-sonnet-4-6", 1.0)],
        "turns_per_day": (35, 90),
        "in_tokens": (6000, 22000), "out_tokens": (700, 2200),
        "cache_read": (0, 0),
        "profile": "evening",
    },
}

HOUR_WEIGHTS = {
    "business": [1, 1, 1, 1, 1, 2, 4, 8, 14, 18, 20, 19, 16, 18, 20, 19, 16, 12, 8, 5, 4, 3, 2, 1],
    "flat":     [4, 3, 3, 3, 3, 4, 6, 8, 10, 11, 11, 11, 10, 11, 11, 11, 10, 9, 8, 7, 6, 5, 5, 4],
    "evening":  [1, 1, 1, 1, 1, 1, 1, 2, 3, 4, 5, 6, 7, 8, 10, 14, 20, 22, 14, 6, 3, 2, 1, 1],
}


def pick_model(models, rng):
    r, acc = rng.random(), 0.0
    for model, w in models:
        acc += w
        if r <= acc:
            return model
    return models[-1][0]


def day_events(app, cfg, day, rng):
    """Generate one app-day of events."""
    weekend = day.weekday() >= 5
    lo, hi = cfg["turns_per_day"]
    n = int(rng.randint(lo, hi) * (0.25 if weekend else 1.0)
            * rng.uniform(0.85, 1.15))
    weights = HOUR_WEIGHTS[cfg["profile"]]
    now = datetime.now(timezone.utc)
    out = []
    for i in range(n):
        hour = rng.choices(range(24), weights=weights)[0]
        ts = day.replace(hour=hour, minute=rng.randint(0, 59),
                         second=rng.randint(0, 59))
        if ts > now:
            continue
        model = pick_model(cfg["models"], rng)
        itok = rng.randint(*cfg["in_tokens"])
        otok = rng.randint(*cfg["out_tokens"])
        crt = rng.randint(*cfg["cache_read"]) if cfg["cache_read"][1] else 0
        out.append({
            "event_id": str(uuid.uuid5(NAMESPACE, f"{app}:{day.date()}:{i}")),
            "app": app,
            "model": model,
            "ts": ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "input_tokens": itok,
            "output_tokens": otok,
            "cache_read_tokens": crt,
            "cache_write_tokens": 0,
            "cost_usd": round(estimate_cost(model, itok, otok, crt), 8),
            "session_id": f"demo-{rng.randint(1000, 9999)}",
        })
    return out


def post_batches(url, events, batch=1000):
    accepted = duplicates = 0
    with httpx.Client(timeout=30.0) as client:
        for i in range(0, len(events), batch):
            resp = client.post(url + "/v1/events",
                               json={"events": events[i:i + batch]})
            resp.raise_for_status()
            body = resp.json()
            accepted += body["accepted"]
            duplicates += body["duplicates"]
    return accepted, duplicates


def seed(url, days):
    rng = random.Random(42)
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0,
                                               microsecond=0)
    events = []
    for back in range(days, -1, -1):
        day = today - timedelta(days=back)
        for app, cfg in APPS.items():
            events.extend(day_events(app, cfg, day, rng))
    events.sort(key=lambda e: e["ts"])
    print(f"generated {len(events)} events over {days} days; posting…")
    accepted, duplicates = post_batches(url, events)
    print(f"done: {accepted} accepted, {duplicates} duplicates")


def live(url):
    """Emit a trickle of current events so the live feed moves."""
    rng = random.Random()
    print("emitting live events (ctrl-c to stop)…")
    with httpx.Client(timeout=10.0) as client:
        while True:
            app = rng.choice(list(APPS))
            cfg = APPS[app]
            model = pick_model(cfg["models"], rng)
            itok = rng.randint(*cfg["in_tokens"])
            otok = rng.randint(*cfg["out_tokens"])
            event = {
                "event_id": str(uuid.uuid4()),
                "app": app,
                "model": model,
                "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "input_tokens": itok,
                "output_tokens": otok,
                "cost_usd": round(estimate_cost(model, itok, otok), 8),
                "session_id": f"live-{rng.randint(1000, 9999)}",
            }
            client.post(url + "/v1/events", json={"events": [event]})
            print(f"  {app} {model} {event['cost_usd']:.4f}")
            time.sleep(rng.uniform(2, 7))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8787")
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--live", action="store_true")
    args = ap.parse_args()
    if args.live:
        live(args.url)
    else:
        seed(args.url, args.days)
