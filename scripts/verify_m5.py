"""M5 (prove depth) verification — run via scripts/verify-m5.sh.

Proves: generate a multi-persona suite -> eval with quality + latency + cost ->
Gate 2 blocks a failing agent and passes a good one (deploy is gated on it).
"""
import http.cookiejar
import json
import os
import time
import urllib.request

import psycopg

CONSOLE = os.environ.get("CONSOLE_URL", "http://localhost:3000")
GROUND = os.environ.get("GROUND_URL", "http://localhost:8790")
EVAL = os.environ.get("EVAL_URL", "http://localhost:8792")
DB = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/agent_platform")

cj = http.cookiejar.CookieJar()
console = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
PASS = FAIL = 0
ok = lambda m: (globals().__setitem__("PASS", PASS + 1), print(f"  ✓ {m}"))  # noqa: E731
bad = lambda m: (globals().__setitem__("FAIL", FAIL + 1), print(f"  ✗ {m}"))  # noqa: E731


def post(url, body, opener=None, timeout=180):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        r = opener.open(req, timeout=timeout) if opener else urllib.request.urlopen(req, timeout=timeout)
        return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


slug = f"m5-demo-{int(time.time())}"
console.open(urllib.request.Request(f"{CONSOLE}/api/dev-login?user=alice", data=b"", method="POST"))
_, proj = post(f"{CONSOLE}/api/projects", {"name": "M5 Demo", "slug": slug, "domain": "banking"}, console)
pid = proj["id"]
post(f"{CONSOLE}/api/specify", {"projectId": pid, "topic": "UK current account overdraft help"}, console)
_, ing = post(f"{GROUND}/v1/ingest", {"project_id": pid, "submitted_by": "bob", "docs": [
    {"uri": "doc/overdraft", "title": "Overdrafts",
     "body": "# Overdraft fees\n\nWe charge 39.9% EAR variable interest on arranged overdrafts. There is no fee below 50 pounds.\n\n# Switching\n\nThe Current Account Switch Service moves payments in 7 working days."}]})
post(f"{GROUND}/v1/approve", {"revision_id": ing["items"][0]["revision_id"], "approver": "alice"})
with psycopg.connect(DB) as conn:
    kbout = str(conn.execute("SELECT id FROM artifact WHERE project_id=%s AND type='kb_outline' ORDER BY version DESC LIMIT 1", (pid,)).fetchone()[0])
post(f"{GROUND}/v1/release", {"project_id": pid, "kb_outline_artifact_id": kbout})
_, av = post(f"{CONSOLE}/api/agent/build", {"projectId": pid, "paradigm": "code"}, console)
avid = av["agent_version_id"]
print("  setup: spec + release + agent ready\n")

print("── Multi-persona test suite ──")
_, ts = post(f"{EVAL}/v1/testsuite", {"agent_version_id": avid})
ok(f"test_suite: {ts['personas']} personas, {ts['cases']} cases") if ts.get("cases", 0) >= 2 else bad(f"suite too small: {ts}")

print("\n── Eval with quality + latency + cost ──")
_, ev = post(f"{EVAL}/v1/run-suite", {"agent_version_id": avid, "test_suite_id": ts["test_suite_id"]})
m = ev.get("metrics", {})
have = all(k in m for k in ["quality", "latency_ms", "cost_usd"])
ok(f"eval_run metrics q={m.get('quality')} lat={m.get('latency_ms')}ms cost=${m.get('cost_usd')} · personas={ev.get('perPersona')}") if have else bad(f"missing metrics: {m}")

print("\n── Gate 2 blocks a failing agent ──")
post(f"{EVAL}/v1/policy", {"project_id": pid, "pre_deploy_gates": {"quality": 1.1, "latency_ms": 1, "cost_usd": 0.0}})
_, g = post(f"{EVAL}/v1/gate2", {"project_id": pid, "agent_version_id": avid})
ok(f"Gate 2 blocks (reasons: {g.get('reasons')})") if g.get("pass") is False else bad("Gate 2 should block under strict gates")
code, dep = post(f"{CONSOLE}/api/deploy", {"agentVersionId": avid}, console)
ok("deploy blocked by Gate 2 (409)") if code == 409 else bad(f"deploy should be blocked, got {code}")

print("\n── Gate 2 passes a good agent ──")
post(f"{EVAL}/v1/policy", {"project_id": pid, "pre_deploy_gates": {"quality": 0.5}})
_, g2 = post(f"{EVAL}/v1/gate2", {"project_id": pid, "agent_version_id": avid})
ok("Gate 2 passes under lenient gates") if g2.get("pass") is True else bad(f"Gate 2 should pass: {g2}")
code2, _ = post(f"{CONSOLE}/api/deploy", {"agentVersionId": avid}, console)
ok("deploy allowed after Gate 2 passes (201)") if code2 == 201 else bad(f"deploy should succeed, got {code2}")

print("\n── Lineage ──")
with psycopg.connect(DB) as conn:
    edges = conn.execute("""SELECT count(*) FROM artifact_parent ap
        JOIN artifact c ON c.id=ap.child_id JOIN artifact p ON p.id=ap.parent_id
        WHERE c.project_id=%s AND (
          (c.type='test_suite' AND p.type='agent_version') OR
          (c.type='eval_run'   AND p.type='test_suite') OR
          (c.type='gate2'      AND p.type='agent_version') OR
          (c.type='deployment' AND p.type='agent_version'))""", (pid,)).fetchone()[0]
ok(f"prove-phase artifacts linked ({edges} edges)") if edges >= 4 else bad(f"expected >=4 edges, found {edges}")

print("\n" + "=" * 40)
print(f"  M5 verification: {PASS} passed, {FAIL} failed")
print("=" * 40)
print("  ✅ M5 GREEN" if FAIL == 0 else "  ❌ M5 not green")
raise SystemExit(0 if FAIL == 0 else 1)
