"""H5 verification — real ONNX embeddings (fastembed / bge-small).

Proves: a real semantic model is active; it scores a paraphrase higher than an
unrelated sentence; and vector retrieval finds the semantically-correct chunk for
a query that shares NO keywords with it (the hash embedder could not).
"""
import json
import math
import os
import time
import urllib.request

import psycopg

from providers import embed, embed_engine

GROUND = os.environ.get("GROUND_URL", "http://localhost:8790")
DB = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/agent_platform")
PASS = FAIL = 0
ok = lambda m: (globals().__setitem__("PASS", PASS + 1), print(f"  ✓ {m}"))  # noqa: E731
bad = lambda m: (globals().__setitem__("FAIL", FAIL + 1), print(f"  ✗ {m}"))  # noqa: E731


def post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=60).read())


def cos(a, b):
    return sum(x * y for x, y in zip(a, b)) / ((math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))) or 1)


print("── Real embedding model ──")
ok(f"engine={embed_engine()}") if embed_engine().startswith("fastembed") else bad(f"not a real model: {embed_engine()}")
v = embed(["how do I switch my current account", "moving my salary to another bank", "the overdraft interest rate"])
ok(f"dim={len(v[0])}") if len(v[0]) == 384 else bad(f"dim {len(v[0])}")
related, unrelated = cos(v[0], v[1]), cos(v[0], v[2])
ok(f"semantic: paraphrase {related:.2f} > unrelated {unrelated:.2f}") if related > unrelated + 0.1 else bad(f"no semantic gap: {related:.2f} vs {unrelated:.2f}")

print("\n── Semantic retrieval (no keyword overlap) ──")
# minimal setup directly against Ground (no console needed)
with psycopg.connect(DB) as c:
    pid = str(c.execute(
        "INSERT INTO project (slug, name, owner) VALUES (%s,'H Embed','tester') RETURNING id",
        (f"h-embed-{int(time.time())}",)).fetchone()[0])
    c.commit()
ing = post(f"{GROUND}/v1/ingest", {"project_id": pid, "submitted_by": "bob", "docs": [
    {"uri": "doc/overdraft", "title": "Overdraft",
     "body": "# Overdraft charges\n\nWe levy 39.9 percent EAR variable interest on arranged borrowing."},
    {"uri": "doc/switch", "title": "Switching",
     "body": "# Changing provider\n\nThe Current Account Switch Service relocates your direct debits and income within seven working days."}]})
for it in ing["items"]:
    post(f"{GROUND}/v1/approve", {"revision_id": it["revision_id"], "approver": "alice"})
rel = post(f"{GROUND}/v1/release", {"project_id": pid, "kb_outline_artifact_id": None})
# query shares no salient words with "Changing provider / relocates direct debits / income"
res = post(f"{GROUND}/v1/retrieve", {"project_id": pid, "release_key": rel["release_key"],
           "query": "how can I transfer my bank to a different company?", "k": 2, "mode": "vector"})
top = res["chunks"][0] if res["chunks"] else {}
ok(f"top chunk is the switching doc (score {top.get('score')})") if "Switch" in (top.get("body", "")) or "relocat" in top.get("body", "").lower() else bad(f"wrong top chunk: {top.get('heading_path')} / {top.get('body','')[:60]}")

print("\n" + "=" * 40)
print(f"  H5 (embeddings) verification: {PASS} passed, {FAIL} failed")
print("=" * 40)
print("  ✅ H5 GREEN" if FAIL == 0 else "  ❌ H5 not green")
raise SystemExit(0 if FAIL == 0 else 1)
