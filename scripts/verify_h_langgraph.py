"""H8 verification — real LangGraph runtime for the `langgraph` paradigm.

Proves: a langgraph-paradigm agent executes a compiled LangGraph StateGraph
(retrieve -> generate), produces a grounded answer + full provenance, and the
`code` paradigm still uses the inline runtime (dispatch works).
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
PASS = FAIL = 0
ok = lambda m: (globals().__setitem__("PASS", PASS + 1), print(f"  ✓ {m}"))  # noqa: E731
bad = lambda m: (globals().__setitem__("FAIL", FAIL + 1), print(f"  ✗ {m}"))  # noqa: E731


def post(url, body, opener=None, timeout=120):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    op = opener.open if opener else urllib.request.urlopen
    r = op(req, timeout=timeout)
    return json.loads(r.read() or b"{}")


cj = http.cookiejar.CookieJar()
console = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
console.open(urllib.request.Request(f"{CONSOLE}/api/dev-login?user=alice", data=b"", method="POST"))
slug = f"h-lg-{int(time.time())}"
proj = post(f"{CONSOLE}/api/projects", {"name": "H LangGraph", "slug": slug, "domain": "banking"}, console)
pid = proj["id"]
post(f"{CONSOLE}/api/specify", {"projectId": pid, "topic": "UK current account overdraft help"}, console)
ing = post(f"{GROUND}/v1/ingest", {"project_id": pid, "submitted_by": "bob", "docs": [
    {"uri": "d", "title": "O", "body": "# Overdraft fees\n\nWe charge 39.9 percent EAR variable interest on arranged overdrafts. No fee below 50 pounds."}]})
post(f"{GROUND}/v1/approve", {"revision_id": ing["items"][0]["revision_id"], "approver": "alice"})
with psycopg.connect(DB) as c:
    kbout = str(c.execute("SELECT id FROM artifact WHERE project_id=%s AND type='kb_outline' ORDER BY version DESC LIMIT 1", (pid,)).fetchone()[0])
    spid = str(c.execute("SELECT id FROM artifact WHERE project_id=%s AND type='system_prompt' ORDER BY version DESC LIMIT 1", (pid,)).fetchone()[0])
rel = post(f"{GROUND}/v1/release", {"project_id": pid, "kb_outline_artifact_id": kbout})
kbr = rel["kb_release_artifact_id"]

print("── LangGraph paradigm executes the StateGraph ──")
lg = post(f"{BUILD}/v1/build", {"project_id": pid, "paradigm": "langgraph",
          "system_prompt_artifact_id": spid, "kb_release_artifact_id": kbr})
ok("built a langgraph agent_version") if lg.get("build_paradigm") == "langgraph" else bad(f"build: {lg}")
chat = post(f"{BUILD}/v1/chat", {"agent_version_id": lg["agent_version_id"],
            "question": "What is the overdraft interest rate?"})
prov_ok = all(chat.get("provenance", {}).get(x) is not None for x in ["release_key", "agent_version", "item_id", "revision_id", "chunk_id"])
grounded = "39.9" in chat.get("answer", "")
ok(f"langgraph chat: build_paradigm={chat.get('build_paradigm')}, grounded={grounded}, provenance={prov_ok}") \
    if chat.get("build_paradigm") == "langgraph" and grounded and prov_ok else bad(f"langgraph chat: {chat.get('build_paradigm')} grounded={grounded} prov={prov_ok}")

print("\n── `code` paradigm still uses the inline runtime ──")
code = post(f"{BUILD}/v1/build", {"project_id": pid, "paradigm": "code",
            "system_prompt_artifact_id": spid, "kb_release_artifact_id": kbr})
cchat = post(f"{BUILD}/v1/chat", {"agent_version_id": code["agent_version_id"],
             "question": "Is there a fee under 50 pounds?"})
ok(f"code chat: build_paradigm={cchat.get('build_paradigm')}, grounded={'50' in cchat.get('answer','') or 'no fee' in cchat.get('answer','').lower()}") \
    if cchat.get("build_paradigm") == "code" else bad(f"code chat: {cchat.get('build_paradigm')}")

print("\n" + "=" * 40)
print(f"  H8 (LangGraph) verification: {PASS} passed, {FAIL} failed")
print("=" * 40)
print("  ✅ H8 GREEN" if FAIL == 0 else "  ❌ H8 not green")
raise SystemExit(0 if FAIL == 0 else 1)
