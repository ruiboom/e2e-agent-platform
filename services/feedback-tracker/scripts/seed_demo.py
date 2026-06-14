"""Seed the collector with realistic synthetic feedback.

Generates ~30 days of feedback for several demo apps with a mix of kinds
(NPS, CSAT, thumbs, free text, bug/idea/praise), realistic sentiment skew and
plausible comments, then POSTs it through the real ingest API (so the whole
pipeline is exercised). Feedback ids are deterministic, so re-running is
idempotent.

Usage:
    python scripts/seed_demo.py [--days 30] [--url http://127.0.0.1:8788]
    python scripts/seed_demo.py --live          # trickle live feedback forever
"""

import argparse
import random
import time
import uuid
from datetime import datetime, timedelta, timezone

import httpx

NAMESPACE = uuid.uuid5(uuid.NAMESPACE_DNS, "feedback-tracker-demo")

# app -> (kinds with weights, items/day range, sentiment skew, pages)
APPS = {
    "support-bot": {
        "kinds": [("csat", 0.45), ("thumb", 0.3), ("freeform", 0.1),
                  ("bug", 0.1), ("praise", 0.05)],
        "per_day": (40, 90), "pos_bias": 0.62,
        "pages": ["/chat", "/chat/history", "/account"],
    },
    "doc-search": {
        "kinds": [("thumb", 0.6), ("freeform", 0.2), ("idea", 0.1), ("bug", 0.1)],
        "per_day": (60, 130), "pos_bias": 0.55,
        "pages": ["/search", "/search/results", "/docs"],
    },
    "code-assistant": {
        "kinds": [("csat", 0.3), ("nps", 0.2), ("idea", 0.2),
                  ("bug", 0.2), ("praise", 0.1)],
        "per_day": (20, 50), "pos_bias": 0.5,
        "pages": ["/editor", "/review", "/settings/keys"],
    },
    "meeting-notes": {
        "kinds": [("nps", 0.4), ("csat", 0.3), ("freeform", 0.2), ("praise", 0.1)],
        "per_day": (8, 24), "pos_bias": 0.68,
        "pages": ["/notes", "/notes/share", "/calendar"],
    },
}

COMMENTS = {
    "positive": [
        "Love this — saved me so much time today.",
        "Works exactly how I'd hope. Really polished.",
        "The new layout is so much clearer, thank you!",
        "Fast and accurate. No notes.",
        "Honestly delightful to use.",
        "Great improvement over last month.",
        "",  # bare rating, no comment
    ],
    "neutral": [
        "It's fine, does the job.",
        "Mostly good but could be faster.",
        "Took me a moment to find the right option.",
        "Works, though the wording is a little confusing.",
        "",
    ],
    "negative": [
        "The export button is impossible to find.",
        "Crashed when I uploaded a large file.",
        "Results were off-topic for my query.",
        "Too many clicks to get anything done.",
        "It logged me out halfway through. Frustrating.",
        "Slow today — spinner for 10+ seconds.",
    ],
    "bug": [
        "Clicking 'save' does nothing on Safari.",
        "The page is blank after the latest update.",
        "Search throws a 500 error for queries with quotes.",
        "Attachment preview shows the wrong file.",
    ],
    "idea": [
        "Would love a dark mode.",
        "Please add keyboard shortcuts for navigation.",
        "Can we get CSV export for the results table?",
        "An undo button would be amazing.",
    ],
    "praise": [
        "Whoever built this — thank you. Brilliant.",
        "Best tool we use, hands down.",
        "The support here is fantastic.",
    ],
}


def pick_weighted(pairs, rng):
    r, acc = rng.random(), 0.0
    for value, w in pairs:
        acc += w
        if r <= acc:
            return value
    return pairs[-1][0]


def make_item(app, cfg, ts, i, rng):
    kind = pick_weighted(cfg["kinds"], rng)
    positive = rng.random() < cfg["pos_bias"]
    rating, sentiment, pool = None, None, None

    if kind == "csat":
        rating = rng.choices([5, 4, 3, 2, 1],
                             weights=[40, 25, 15, 12, 8] if positive else [10, 15, 25, 25, 25])[0]
        sentiment = "positive" if rating >= 4 else ("neutral" if rating == 3 else "negative")
    elif kind == "nps":
        rating = rng.choices(range(0, 11),
                             weights=[1, 1, 1, 2, 2, 4, 5, 9, 12, 16, 14] if positive
                             else [6, 5, 6, 7, 8, 9, 8, 6, 4, 2, 1])[0]
        sentiment = "positive" if rating >= 9 else ("neutral" if rating >= 7 else "negative")
    elif kind == "thumb":
        rating = 1 if positive else -1
        sentiment = "positive" if positive else "negative"
    elif kind == "bug":
        sentiment = "negative"
    elif kind in ("idea",):
        sentiment = None
    elif kind == "praise":
        sentiment = "positive"

    if kind == "bug":
        pool = "bug"
    elif kind == "idea":
        pool = "idea"
    elif kind == "praise":
        pool = "praise"
    else:
        pool = sentiment or ("positive" if positive else "negative")
    text = rng.choice(COMMENTS[pool])
    # free-text kinds always carry a comment
    if kind in ("freeform",) and not text:
        text = rng.choice(COMMENTS["neutral"][:-1])

    item = {
        "feedback_id": str(uuid.uuid5(NAMESPACE, f"{app}:{ts.date()}:{i}")),
        "app": app,
        "kind": kind,
        "ts": ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "meta": {"page": rng.choice(cfg["pages"]), "app_version": "2.4.1"},
    }
    if rating is not None:
        item["rating"] = rating
    if sentiment:
        item["sentiment"] = sentiment
    if text:
        item["text"] = text
    if rng.random() < 0.5:
        item["session_id"] = f"demo-{rng.randint(1000, 9999)}"
    return item


def day_items(app, cfg, day, rng):
    weekend = day.weekday() >= 5
    lo, hi = cfg["per_day"]
    n = int(rng.randint(lo, hi) * (0.4 if weekend else 1.0))
    now = datetime.now(timezone.utc)
    out = []
    for i in range(n):
        ts = day.replace(hour=rng.randint(7, 22), minute=rng.randint(0, 59),
                         second=rng.randint(0, 59))
        if ts > now:
            continue
        out.append(make_item(app, cfg, ts, i, rng))
    return out


def post_batches(url, items, batch=500):
    accepted = duplicates = 0
    with httpx.Client(timeout=30.0) as client:
        for i in range(0, len(items), batch):
            resp = client.post(url + "/v1/feedback", json={"items": items[i:i + batch]})
            resp.raise_for_status()
            body = resp.json()
            accepted += body["accepted"]
            duplicates += body["duplicates"]
    return accepted, duplicates


def seed(url, days):
    rng = random.Random(42)
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    items = []
    for back in range(days, -1, -1):
        day = today - timedelta(days=back)
        for app, cfg in APPS.items():
            items.extend(day_items(app, cfg, day, rng))
    items.sort(key=lambda e: e["ts"])
    print(f"generated {len(items)} feedback items over {days} days; posting…")
    accepted, duplicates = post_batches(url, items)
    print(f"done: {accepted} accepted, {duplicates} duplicates")


def live(url):
    rng = random.Random()
    print("emitting live feedback (ctrl-c to stop)…")
    with httpx.Client(timeout=10.0) as client:
        while True:
            app = rng.choice(list(APPS))
            cfg = APPS[app]
            item = make_item(app, cfg, datetime.now(timezone.utc),
                             rng.randint(0, 1_000_000), rng)
            item["feedback_id"] = str(uuid.uuid4())
            client.post(url + "/v1/feedback", json={"items": [item]})
            print(f"  {app} {item['kind']} {item.get('sentiment', '–')}: {item.get('text', '')[:50]}")
            time.sleep(rng.uniform(2, 7))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8788")
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--live", action="store_true")
    args = ap.parse_args()
    if args.live:
        live(args.url)
    else:
        seed(args.url, args.days)
