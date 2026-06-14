"""H2 verification — OPA-style policy engine + risk classifier at Gate 2.

Proves: an agent is risk-classified; a policy rule (deny high-risk on the voice
channel) blocks deploy to voice but allows web — enforced through Gate 2.
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


def post(url, body, opener=None, timeout=120):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        r = opener.open(req, timeout=timeout) if opener else urllib.request.urlopen(req, timeout=timeout)
        return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


slug = f"h-policy-{int(time.time())}"
console.open(urllib.request.Request(f"{CONSOLE}/api/dev-login?user=alice", data=b"", method="POST"))
# A deliberately HIGH-risk purpose:
_, proj = post(f"{CONSOLE}/api/projects", {"name": "H Policy", "slug": slug, "domain": "banking"}, console)
pid = proj["id"]
post(f"{CONSOLE}/api/specify",
     {"projectId": pid, "topic": "Financial advice on loan eligibility for current account overdrafts"}, console)
_, ing = post(f"{GROUND}/v1/ingest", {"project_id": pid, "submitted_by": "bob", "docs": [
    {"uri": "doc/x", "title": "X", "body": "# Overdraft\n\n39.9% EAR variable; no fee below 50 pounds."}]})
post(f"{GROUND}/v1/approve", {"revision_id": ing["items"][0]["revision_id"], "approver": "alice"})
with psycopg.connect(DB) as c:
    kbout = str(c.execute("SELECT id FROM artifact WHERE project_id=%s AND type='kb_outline' ORDER BY version DESC LIMIT 1", (pid,)).fetchone()[0])
post(f"{GROUND}/v1/release", {"project_id": pid, "kb_outline_artifact_id": kbout})
_, av = post(f"{CONSOLE}/api/agent/build", {"projectId": pid, "paradigm": "code"}, console)
avid = av["agent_version_id"]
post(f"{EVAL}/v1/eval", {"agent_version_id": avid, "questions": ["What is the overdraft interest rate?"]})

print("── Policy: deny high-risk on the voice channel ──")
post(f"{EVAL}/v1/policy", {"project_id": pid, "pre_deploy_gates": {"quality": 0.0}, "opa_rules": {
    "deny": [{"id": "high-risk-voice",
              "all": [{"field": "risk_tier", "op": "eq", "value": "high"},
                      {"field": "channels", "op": "contains", "value": "voice"}],
              "reason": "high-risk agents may not use the voice channel without human handoff"}]}})
ok("policy set (lenient thresholds + 1 deny rule)")

print("\n── Risk classification + Gate 2 (policy-aware) ──")
_, gv = post(f"{EVAL}/v1/gate2", {"project_id": pid, "agent_version_id": avid, "context": {"channels": ["voice"]}})
ok(f"agent classified risk_tier={gv.get('risk_tier')} (signals {gv.get('risk_signals')})") if gv.get("risk_tier") == "high" else bad(f"risk not high: {gv}")
blocked = gv.get("pass") is False and any("policy[high-risk-voice]" in r for r in gv.get("reasons", []))
ok(f"Gate 2 blocks voice by policy ({gv.get('reasons')})") if blocked else bad(f"voice not blocked: {gv}")
_, gw = post(f"{EVAL}/v1/gate2", {"project_id": pid, "agent_version_id": avid, "context": {"channels": ["web"]}})
ok("Gate 2 allows web (policy + thresholds pass)") if gw.get("pass") else bad(f"web blocked: {gw}")

print("\n── Deploy enforces the policy ──")
cv, _ = post(f"{CONSOLE}/api/deploy", {"agentVersionId": avid, "target": "local", "channels": ["voice"]}, console)
ok("deploy to voice blocked (409)") if cv == 409 else bad(f"voice deploy -> {cv}")
cw, _ = post(f"{CONSOLE}/api/deploy", {"agentVersionId": avid, "target": "local", "channels": ["web"]}, console)
ok("deploy to web allowed (201)") if cw == 201 else bad(f"web deploy -> {cw}")

print("\n" + "=" * 40)
print(f"  H2 (policy) verification: {PASS} passed, {FAIL} failed")
print("=" * 40)
print("  ✅ H2 GREEN" if FAIL == 0 else "  ❌ H2 not green")
raise SystemExit(0 if FAIL == 0 else 1)
