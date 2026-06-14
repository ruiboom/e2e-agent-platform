"""M4 (build breadth) verification — run via scripts/verify-m4.sh.

Proves: the same spec builds via canvas, flow, yaml and generative — each yields
a valid agent_version that chats (with provenance) and passes a basic eval.
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
EVAL = os.environ.get("EVAL_URL", "http://localhost:8792")
DB = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/agent_platform")

cj = http.cookiejar.CookieJar()
console = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
PASS = FAIL = 0
ok = lambda m: (globals().__setitem__("PASS", PASS + 1), print(f"  ✓ {m}"))  # noqa: E731
bad = lambda m: (globals().__setitem__("FAIL", FAIL + 1), print(f"  ✗ {m}"))  # noqa: E731


def post(url, body, opener=None, timeout=120):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        r = opener.open(req, timeout=timeout) if opener else urllib.request.urlopen(req, timeout=timeout)
        return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


slug = f"m4-demo-{int(time.time())}"
console.open(urllib.request.Request(f"{CONSOLE}/api/dev-login?user=alice", data=b"", method="POST"))
_, proj = post(f"{CONSOLE}/api/projects", {"name": "M4 Demo", "slug": slug, "domain": "banking"}, console)
pid = proj["id"]
post(f"{CONSOLE}/api/specify", {"projectId": pid, "topic": "UK current account overdraft help"}, console)
_, ing = post(f"{GROUND}/v1/ingest", {"project_id": pid, "submitted_by": "bob", "docs": [
    {"uri": "doc/overdraft", "title": "Overdrafts",
     "body": "# Overdraft fees\n\nWe charge 39.9% EAR variable interest on arranged overdrafts. There is no fee below 50 pounds."}]})
post(f"{GROUND}/v1/approve", {"revision_id": ing["items"][0]["revision_id"], "approver": "alice"})

with psycopg.connect(DB) as conn:
    kbout = str(conn.execute("SELECT id FROM artifact WHERE project_id=%s AND type='kb_outline' ORDER BY version DESC LIMIT 1", (pid,)).fetchone()[0])
    spid = str(conn.execute("SELECT id FROM artifact WHERE project_id=%s AND type='system_prompt' ORDER BY version DESC LIMIT 1", (pid,)).fetchone()[0])
_, rel = post(f"{GROUND}/v1/release", {"project_id": pid, "kb_outline_artifact_id": kbout})
kbr = rel["kb_release_artifact_id"]
print("  setup: spec + approved release ready\n")

paradigms = ["canvas", "flow", "yaml", "generative"]
built = {}
for p in paradigms:
    print(f"── Build paradigm: {p} ──")
    _, av = post(f"{BUILD}/v1/build", {"project_id": pid, "paradigm": p,
                 "system_prompt_artifact_id": spid, "kb_release_artifact_id": kbr})
    avid = av.get("agent_version_id")
    if not avid or av.get("build_paradigm") != p:
        bad(f"{p}: build did not yield an agent_version"); continue
    built[p] = avid
    _, chat = post(f"{BUILD}/v1/chat", {"agent_version_id": avid, "question": "What is the overdraft interest rate?"})
    prov_ok = all(chat.get("provenance", {}).get(k) is not None for k in ["release_key", "agent_version", "item_id", "revision_id", "chunk_id"])
    _, ev = post(f"{EVAL}/v1/eval", {"agent_version_id": avid,
                 "questions": ["What is the overdraft interest rate?"]})
    gate = ev.get("gateResult")
    if prov_ok and gate == "pass":
        ok(f"{p}: agent_version chats (provenance) + eval {gate}")
    else:
        bad(f"{p}: prov_ok={prov_ok} gate={gate}")

print("\n── Distinctness ──")
with psycopg.connect(DB) as conn:
    rows = conn.execute("SELECT payload->>'build_paradigm' FROM artifact WHERE project_id=%s AND type='agent_version'", (pid,)).fetchall()
    distinct = {r[0] for r in rows}
ok(f"{len(built)} paradigms built, {len(distinct)} distinct: {sorted(distinct)}") if len(built) == 4 and len(distinct) == 4 else bad(f"built={sorted(built)} distinct={sorted(distinct)}")

print("\n" + "=" * 40)
print(f"  M4 verification: {PASS} passed, {FAIL} failed")
print("=" * 40)
print("  ✅ M4 GREEN" if FAIL == 0 else "  ❌ M4 not green")
raise SystemExit(0 if FAIL == 0 else 1)
