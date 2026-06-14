"""M7 (operate & loop) verification — run via scripts/verify-m7.sh.

Proves: a deployed agent's real logs produce an auto-improvement proposal that
re-enters the pipeline as a new artifact version (closing the loop).
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
OPTIMISE = os.environ.get("OPTIMISE_URL", "http://localhost:8793")
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


slug = f"m7-demo-{int(time.time())}"
console.open(urllib.request.Request(f"{CONSOLE}/api/dev-login?user=alice", data=b"", method="POST"))
_, proj = post(f"{CONSOLE}/api/projects", {"name": "M7 Demo", "slug": slug, "domain": "banking"}, console)
pid = proj["id"]
post(f"{CONSOLE}/api/specify", {"projectId": pid, "topic": "UK current account overdraft help"}, console)
_, ing = post(f"{GROUND}/v1/ingest", {"project_id": pid, "submitted_by": "bob", "docs": [
    {"uri": "doc/overdraft", "title": "Overdrafts",
     "body": "# Overdraft fees\n\nWe charge 39.9% EAR variable interest on arranged overdrafts. There is no fee below 50 pounds."}]})
post(f"{GROUND}/v1/approve", {"revision_id": ing["items"][0]["revision_id"], "approver": "alice"})
with psycopg.connect(DB) as conn:
    kbout = str(conn.execute("SELECT id FROM artifact WHERE project_id=%s AND type='kb_outline' ORDER BY version DESC LIMIT 1", (pid,)).fetchone()[0])
    sp_v1 = str(conn.execute("SELECT id FROM artifact WHERE project_id=%s AND type='system_prompt' ORDER BY version DESC LIMIT 1", (pid,)).fetchone()[0])
post(f"{GROUND}/v1/release", {"project_id": pid, "kb_outline_artifact_id": kbout})
_, av = post(f"{CONSOLE}/api/agent/build", {"projectId": pid, "paradigm": "code"}, console)
avid = av["agent_version_id"]
print("  setup: spec + release + agent ready\n")

print("── Generate live traffic (on- and off-topic) ──")
traffic = ["What is the overdraft interest rate?", "Is there a fee under 50 pounds?",
           "What is the capital of France?", "Tell me a joke about the weather."]
for q in traffic:
    post(f"{BUILD}/v1/chat", {"agent_version_id": avid, "question": q})
with psycopg.connect(DB) as conn:
    n_logs = conn.execute("SELECT count(*) FROM chat_log WHERE agent_version_id=%s", (avid,)).fetchone()[0]
    n_flag = conn.execute("SELECT count(*) FROM chat_log WHERE agent_version_id=%s AND flagged", (avid,)).fetchone()[0]
ok(f"{n_logs} chat logs captured, {n_flag} flagged weak") if n_logs == 4 and n_flag >= 1 else bad(f"logs={n_logs} flagged={n_flag}")

print("\n── Operate: detect -> diagnose -> prescribe ──")
_, op = post(f"{OPTIMISE}/v1/operate", {"agent_version_id": avid})
ok(f"diagnosis: {op['diagnosis']['total_logs']} logs, {op['diagnosis']['weak']} weak") if op.get("status") == "proposed" else bad(f"operate -> {op}")
new_sp = op.get("new_system_prompt_id")
ok(f"improved system_prompt v{op.get('new_version')} proposed — \"{op.get('rationale','')[:60]}…\"") if new_sp and op.get("new_version", 0) > 1 else bad("no new system_prompt version")

print("\n── Loop closed: new version re-enters the pipeline ──")
with psycopg.connect(DB) as conn:
    edge = conn.execute("SELECT count(*) FROM artifact_parent WHERE child_id=%s AND parent_id=%s", (new_sp, sp_v1)).fetchone()[0]
ok("new system_prompt is a child of the original (lineage loop)") if edge == 1 else bad("new system_prompt not linked to original")

_, av2 = post(f"{CONSOLE}/api/agent/build", {"projectId": pid, "paradigm": "code"}, console)
with psycopg.connect(DB) as conn:
    used_sp = conn.execute("SELECT payload->>'system_prompt_artifact_id' FROM artifact WHERE id=%s", (av2["agent_version_id"],)).fetchone()[0]
ok("rebuilt agent_version consumes the improved system_prompt") if used_sp == new_sp else bad(f"rebuild used {used_sp}, expected {new_sp}")

print("\n" + "=" * 40)
print(f"  M7 verification: {PASS} passed, {FAIL} failed")
print("=" * 40)
print("  ✅ M7 GREEN" if FAIL == 0 else "  ❌ M7 not green")
raise SystemExit(0 if FAIL == 0 else 1)
