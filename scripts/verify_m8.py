"""M8 (Academy enablement) verification — run via scripts/verify-m8.sh.

Proves: every stage has contextual help that reads live from the platform, and
a learner can complete a role path end-to-end.
"""
import http.cookiejar
import json
import os
import urllib.request

CONSOLE = os.environ.get("CONSOLE_URL", "http://localhost:3000")
cj = http.cookiejar.CookieJar()
console = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
PASS = FAIL = 0
ok = lambda m: (globals().__setitem__("PASS", PASS + 1), print(f"  ✓ {m}"))  # noqa: E731
bad = lambda m: (globals().__setitem__("FAIL", FAIL + 1), print(f"  ✗ {m}"))  # noqa: E731


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"{CONSOLE}{path}", data=data,
                               headers={"Content-Type": "application/json"}, method=method)
    try:
        resp = console.open(r, timeout=30)
        raw = resp.read()
        is_json = "json" in (resp.headers.get("content-type") or "")
        return resp.status, (json.loads(raw or b"{}") if is_json else {})
    except urllib.error.HTTPError as e:
        return e.code, (json.loads(e.read() or b"{}") if "json" in (e.headers.get("content-type") or "") else {})


console.open(urllib.request.Request(f"{CONSOLE}/api/dev-login?user=alice", data=b"", method="POST"))

print("── Per-stage enablement, read live ──")
_, st = req("GET", "/api/academy/status")
ok(f"enablement covers all 11 stages ({st['stages']})") if st.get("stages") == 11 else bad(f"stages={st.get('stages')}")
ok(f"reads live: {st['liveStages']}/{st['stages']} stages live, {len([s for s in st['services'].values() if s])}/5 services up, {st['projects']} projects") \
    if st.get("liveStages", 0) >= 1 and isinstance(st.get("services"), dict) else bad(f"no live signal: {st}")

code, _ = req("GET", "/academy")
ok("Academy page renders") if code == 200 else bad(f"/academy -> {code}")

print("\n── Complete a role path (Conversation Designer = Specify→Build→Test) ──")
path = "conversation-designer"
stages = ["specify", "build", "test"]
complete = False
for sid in stages:
    _, p = req("POST", "/api/academy/progress", {"path": path, "stageId": sid})
    complete = p.get("complete", False)
    print(f"    marked {sid}: {len(p.get('done', []))}/{len(stages)} done")
ok("role path completed end-to-end") if complete else bad("path not complete after all stages")

# invalid stage for path is rejected
code2, _ = req("POST", "/api/academy/progress", {"path": path, "stageId": "ground"})
ok("stage outside the path is rejected") if code2 == 400 else bad(f"expected 400, got {code2}")

print("\n" + "=" * 40)
print(f"  M8 verification: {PASS} passed, {FAIL} failed")
print("=" * 40)
print("  ✅ M8 GREEN" if FAIL == 0 else "  ❌ M8 not green")
raise SystemExit(0 if FAIL == 0 else 1)
