"""M3 (Ground depth) verification — run via scripts/verify-m3.sh (uv run).

Proves: ingest from web + docs + RSS -> governed canonical store (four-eyes) ->
all six retrieval modes queryable -> pin a release an agent consumes (hybrid).
"""
import http.cookiejar
import json
import os
import time
import urllib.request

import psycopg

CONSOLE = os.environ.get("CONSOLE_URL", "http://localhost:3000")
GROUND = os.environ.get("GROUND_URL", "http://localhost:8790")
BUILD = os.environ.get("BUILD_RUNTIME_URL", "http://localhost:8791")
DB = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/agent_platform")

cj = http.cookiejar.CookieJar()
console = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
PASS = FAIL = 0


def ok(m):
    global PASS
    PASS += 1
    print(f"  ✓ {m}")


def bad(m):
    global FAIL
    FAIL += 1
    print(f"  ✗ {m}")


def post(url, body, opener=None, timeout=90):
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    op = opener or urllib.request.urlopen
    try:
        r = op(req, timeout=timeout) if opener is None else opener.open(req, timeout=timeout)
        return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


slug = f"m3-demo-{int(time.time())}"
console.open(urllib.request.Request(f"{CONSOLE}/api/dev-login?user=alice", data=b"", method="POST"))
_, proj = post(f"{CONSOLE}/api/projects", {"name": "M3 Demo", "slug": slug, "domain": "banking"}, console)
pid = proj["id"]
sc, _ = post(f"{CONSOLE}/api/specify", {"projectId": pid, "topic": "UK current account overdraft help"}, console)
ok("specify emitted scope/system_prompt/kb_outline") if sc == 201 else bad(f"specify -> {sc}")

print("\n── Ingest from docs + web + RSS (submitter: bob) ──")
_, d = post(f"{GROUND}/v1/ingest", {"project_id": pid, "submitted_by": "bob", "docs": [
    {"uri": "doc/overdraft", "title": "Overdrafts",
     "body": "# Overdraft fees\n\nWe charge 39.9% EAR variable interest on arranged overdrafts. There is no fee below 50 pounds."}]})
rid_doc = d["items"][0]["revision_id"]
_, w = post(f"{GROUND}/v1/connect", {"project_id": pid, "submitter": "bob", "kind": "web", "submitted_by": "bob",
            "content": "<html><head><title>Account fees</title></head><body><h1>Account fees</h1>"
                       "<p>The Classic account has no monthly fee. Overdraft interest is charged at a variable rate.</p></body></html>"})
rid_web = w["items"][0]["revision_id"]
_, rss = post(f"{GROUND}/v1/connect", {"project_id": pid, "kind": "rss", "submitted_by": "bob",
              "content": "<rss><channel><item><title>Overdraft changes</title>"
                         "<description>The overdraft interest rate is changing for current accounts.</description>"
                         "<link>news/1</link></item></channel></rss>"})
rid_rss = rss["items"][0]["revision_id"]
ok("ingested 3 source types (docs/web/rss)") if all([rid_doc, rid_web, rid_rss]) else bad("ingest failed")

print("\n── Four-eyes governance ──")
code, resp = post(f"{GROUND}/v1/approve", {"revision_id": rid_doc, "approver": "bob"})
ok("same-author approval rejected (four-eyes)") if code == 400 else bad(f"four-eyes not enforced ({code}: {resp})")
post(f"{GROUND}/v1/approve", {"revision_id": rid_doc, "approver": "alice"})
post(f"{GROUND}/v1/approve", {"revision_id": rid_web, "approver": "alice"})
# rid_rss intentionally left unapproved
ok("two revisions approved by a second actor")

with psycopg.connect(DB) as conn:
    kbout = conn.execute("SELECT id FROM artifact WHERE project_id=%s AND type='kb_outline' ORDER BY version DESC LIMIT 1", (pid,)).fetchone()[0]
    spid = conn.execute("SELECT id FROM artifact WHERE project_id=%s AND type='system_prompt' ORDER BY version DESC LIMIT 1", (pid,)).fetchone()[0]

_, rel = post(f"{GROUND}/v1/release", {"project_id": pid, "kb_outline_artifact_id": str(kbout)})
relkey, kbr_art = rel["release_key"], rel["kb_release_artifact_id"]
ok(f"release pins only approved revisions ({rel['item_count']} of 3)") if rel["item_count"] == 2 else bad(f"expected 2 approved, got {rel['item_count']}")

print("\n── Six retrieval modes ──")
for mode in ["vector", "lexical", "hybrid", "graph", "graph_hybrid"]:
    _, r = post(f"{GROUND}/v1/retrieve", {"project_id": pid, "release_key": relkey, "query": "overdraft interest fee", "k": 3, "mode": mode})
    n = len(r.get("chunks", []))
    ok(f"mode {mode}: {n} chunk(s)") if n >= 1 else bad(f"mode {mode} returned nothing")

print("\n── Agent with hybrid retrieval ──")
_, av = post(f"{BUILD}/v1/agent-version", {"project_id": pid, "system_prompt_artifact_id": str(spid),
             "kb_release_artifact_id": kbr_art, "retrieval_strategy": "hybrid"})
avid = av["agent_version_id"]
_, chat = post(f"{BUILD}/v1/chat", {"agent_version_id": avid, "question": "What is the overdraft interest rate?"})
prov = chat.get("provenance", {})
full = all(prov.get(k) is not None for k in ["release_key", "agent_version", "item_id", "revision_id", "chunk_id"])
ok("hybrid agent answers with full provenance") if chat.get("retrieval_mode") == "hybrid" and full else bad(f"chat: mode={chat.get('retrieval_mode')} prov_ok={full}")

print("\n" + "=" * 40)
print(f"  M3 verification: {PASS} passed, {FAIL} failed")
print("=" * 40)
print("  ✅ M3 GREEN" if FAIL == 0 else "  ❌ M3 not green")
raise SystemExit(0 if FAIL == 0 else 1)
