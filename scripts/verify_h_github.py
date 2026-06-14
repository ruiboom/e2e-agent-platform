"""H9 verification — GitHub connector.

Proves: Ground can ingest a public GitHub repo's docs via the GitHub API into the
governed canonical store (submitted revisions), like any other source.
"""
import json
import os
import time
import urllib.request

import psycopg

GROUND = os.environ.get("GROUND_URL", "http://localhost:8790")
DB = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/agent_platform")
PASS = FAIL = 0
ok = lambda m: (globals().__setitem__("PASS", PASS + 1), print(f"  ✓ {m}"))  # noqa: E731
bad = lambda m: (globals().__setitem__("FAIL", FAIL + 1), print(f"  ✗ {m}"))  # noqa: E731


def call(url, body, timeout=40):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        r = urllib.request.urlopen(req, timeout=timeout)
        return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


with psycopg.connect(DB) as c:
    pid = str(c.execute("INSERT INTO project (slug,name,owner) VALUES (%s,'H GitHub','t') RETURNING id",
                        (f"h-github-{int(time.time())}",)).fetchone()[0]); c.commit()

print("── Ingest a public GitHub repo (README) ──")
code, res = call(f"{GROUND}/v1/connect", {"project_id": pid, "kind": "github",
                "url": "octocat/Hello-World", "submitted_by": "bob"})
ok(f"github connector ingested {len(res.get('items', []))} item(s)") if code == 200 and res.get("items") else bad(f"connect -> {code}: {res}")

with psycopg.connect(DB) as c:
    row = c.execute(
        "SELECT i.uri, r.body, r.state, r.submitted_by FROM kb_item i "
        "JOIN kb_revision r ON r.item_id=i.id WHERE i.project_id=%s ORDER BY r.id DESC LIMIT 1", (pid,)).fetchone()
uri, body, state, sub = row if row else (None, None, None, None)
ok(f"canonical item created (uri={uri}, state={state}, by={sub})") if uri and uri.startswith("github/octocat/Hello-World") and state == "submitted" else bad(f"item wrong: {uri}/{state}")
ok(f"content fetched from GitHub ({len(body or '')} chars: {repr((body or '')[:40])})") if body and "Hello World" in body else bad(f"content wrong: {repr(body)}")

print("\n── Specific path fetch ──")
code2, res2 = call(f"{GROUND}/v1/connect", {"project_id": pid, "kind": "github",
                  "url": "octocat/Hello-World", "paths": ["README"], "submitted_by": "bob"})
ok("github connector fetches a specific path") if code2 == 200 and res2.get("items") else bad(f"path fetch -> {code2}: {res2}")

print("\n" + "=" * 40)
print(f"  H9 (GitHub) verification: {PASS} passed, {FAIL} failed")
print("=" * 40)
print("  ✅ H9 GREEN" if FAIL == 0 else "  ❌ H9 not green")
raise SystemExit(0 if FAIL == 0 else 1)
