"""Backfill importer template.

Maps an app's existing turn logs (JSONL, one turn per line) onto the cost
event schema and POSTs them through the normal ingest endpoint. Event ids
are derived deterministically from the app name + a stable per-record key,
so re-running an import never double-counts.

Adjust FIELD_MAP to your app's log format, then:

    python scripts/backfill.py turns.jsonl --app support-bot \
        --url http://costs.internal:8787 --token $COST_TRACKER_TOKEN
"""

import argparse
import json
import sys
import uuid

import httpx

# log field -> event field. Edit to match your log format.
FIELD_MAP = {
    "model": "model",                 # required
    "timestamp": "ts",                # required, ISO 8601
    "prompt_tokens": "input_tokens",
    "completion_tokens": "output_tokens",
    "cache_read_tokens": "cache_read_tokens",
    "cache_write_tokens": "cache_write_tokens",
    "cost": "cost_usd",
    "conversation_id": "session_id",
}

# stable per-record key for idempotent event ids; falls back to line number
RECORD_KEY = "turn_id"

NAMESPACE = uuid.uuid5(uuid.NAMESPACE_DNS, "cost-tracker-backfill")


def convert(record, app, line_no):
    event = {"app": app}
    for src, dst in FIELD_MAP.items():
        if src in record and record[src] is not None:
            event[dst] = record[src]
    key = record.get(RECORD_KEY, line_no)
    event["event_id"] = str(uuid.uuid5(NAMESPACE, f"{app}:{key}"))
    if "model" not in event or "ts" not in event:
        raise ValueError(f"line {line_no}: missing model or timestamp")
    event.setdefault("cost_usd", 0.0)
    return event


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("logfile")
    ap.add_argument("--app", required=True)
    ap.add_argument("--url", default="http://127.0.0.1:8787")
    ap.add_argument("--token", default="")
    ap.add_argument("--batch", type=int, default=1000)
    args = ap.parse_args()

    events, skipped = [], 0
    with open(args.logfile, encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                events.append(convert(json.loads(line), args.app, line_no))
            except (ValueError, KeyError) as exc:
                skipped += 1
                print(f"skip: {exc}", file=sys.stderr)

    headers = {"Authorization": f"Bearer {args.token}"} if args.token else {}
    accepted = duplicates = 0
    with httpx.Client(timeout=30.0, headers=headers) as client:
        for i in range(0, len(events), args.batch):
            resp = client.post(args.url + "/v1/events",
                               json={"events": events[i:i + args.batch]})
            resp.raise_for_status()
            body = resp.json()
            accepted += body["accepted"]
            duplicates += body["duplicates"]

    print(f"imported {accepted} events ({duplicates} duplicates, "
          f"{skipped} skipped) from {args.logfile}")


if __name__ == "__main__":
    main()
