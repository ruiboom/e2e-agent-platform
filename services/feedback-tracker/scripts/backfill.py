"""Backfill importer template.

Maps an app's existing feedback (JSONL, one record per line — support tickets,
app-store reviews, NPS survey exports, an in-app feedback table dump) onto the
feedback event schema and POSTs them through the normal ingest endpoint.
Feedback ids are derived deterministically from the app name + a stable
per-record key, so re-running an import never double-counts.

Adjust FIELD_MAP and RECORD_KEY to your source format, then:

    python scripts/backfill.py reviews.jsonl --app support-bot \
        --url http://feedback.internal:8788 --token $FEEDBACK_TRACKER_TOKEN
"""

import argparse
import json
import sys
import uuid

import httpx

# source field -> feedback field. Edit to match your export.
FIELD_MAP = {
    "created_at": "ts",        # required, ISO 8601
    "type": "kind",            # nps | csat | thumb | freeform | bug | idea | praise
    "score": "rating",         # numeric rating on the kind's scale, if any
    "sentiment": "sentiment",  # positive | neutral | negative, if you have it
    "comment": "text",
    "user": "user_id",
    "conversation_id": "session_id",
}

# stable per-record key for idempotent ids; falls back to line number
RECORD_KEY = "id"

# extra context to fold into meta from these source fields
META_FIELDS = {"page": "page", "app_version": "version", "feature": "feature"}

NAMESPACE = uuid.uuid5(uuid.NAMESPACE_DNS, "feedback-tracker-backfill")


def convert(record, app, line_no):
    item = {"app": app, "kind": record.get("type", "freeform")}
    for src, dst in FIELD_MAP.items():
        if src in record and record[src] is not None:
            item[dst] = record[src]
    meta = {}
    for dst, src in META_FIELDS.items():
        if record.get(src) is not None:
            meta[dst] = record[src]
    if meta:
        item["meta"] = meta
    key = record.get(RECORD_KEY, line_no)
    item["feedback_id"] = str(uuid.uuid5(NAMESPACE, f"{app}:{key}"))
    if "ts" not in item:
        raise ValueError(f"line {line_no}: missing timestamp")
    return item


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("logfile")
    ap.add_argument("--app", required=True)
    ap.add_argument("--url", default="http://127.0.0.1:8788")
    ap.add_argument("--token", default="")
    ap.add_argument("--batch", type=int, default=500)
    args = ap.parse_args()

    items, skipped = [], 0
    with open(args.logfile, encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                items.append(convert(json.loads(line), args.app, line_no))
            except (ValueError, KeyError) as exc:
                skipped += 1
                print(f"skip: {exc}", file=sys.stderr)

    headers = {"Authorization": f"Bearer {args.token}"} if args.token else {}
    accepted = duplicates = 0
    with httpx.Client(timeout=30.0, headers=headers) as client:
        for i in range(0, len(items), args.batch):
            resp = client.post(args.url + "/v1/feedback",
                               json={"items": items[i:i + args.batch]})
            resp.raise_for_status()
            body = resp.json()
            accepted += body["accepted"]
            duplicates += body["duplicates"]

    print(f"imported {accepted} items ({duplicates} duplicates, "
          f"{skipped} skipped) from {args.logfile}")


if __name__ == "__main__":
    main()
