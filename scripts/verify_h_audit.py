"""H1 verification — tamper-evident audit (hash-chained, WORM).

Proves: (1) a mixed TS+Python write sequence forms ONE valid chain;
(2) the WORM trigger blocks UPDATE/DELETE; (3) the hash chain DETECTS tampering
even when the trigger is bypassed (then we restore, leaving the chain valid).
"""
import http.cookiejar
import json
import os
import time
import urllib.request

import psycopg

CONSOLE = os.environ.get("CONSOLE_URL", "http://localhost:3000")
GROUND = os.environ.get("GROUND_URL", "http://localhost:8790")
DB = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/agent_platform")

cj = http.cookiejar.CookieJar()
console = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
PASS = FAIL = 0
ok = lambda m: (globals().__setitem__("PASS", PASS + 1), print(f"  ✓ {m}"))  # noqa: E731
bad = lambda m: (globals().__setitem__("FAIL", FAIL + 1), print(f"  ✗ {m}"))  # noqa: E731


def post(url, body, opener=None, timeout=90):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        r = opener.open(req, timeout=timeout) if opener else urllib.request.urlopen(req, timeout=timeout)
        return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def verify():
    r = console.open(urllib.request.Request(f"{CONSOLE}/api/audit/verify"), timeout=30)
    return json.loads(r.read())


# ── Mixed-writer activity (TS console + Python services) ──
slug = f"h-audit-{int(time.time())}"
console.open(urllib.request.Request(f"{CONSOLE}/api/dev-login?user=alice", data=b"", method="POST"))
_, proj = post(f"{CONSOLE}/api/projects", {"name": "H Audit", "slug": slug, "domain": "banking"}, console)
pid = proj["id"]
post(f"{CONSOLE}/api/specify", {"projectId": pid, "topic": "UK current account overdraft help"}, console)  # TS writes
_, ing = post(f"{GROUND}/v1/ingest", {"project_id": pid, "submitted_by": "bob", "docs": [
    {"uri": "doc/x", "title": "X", "body": "# Overdraft\n\n39.9% EAR variable."}]})            # py writes
post(f"{GROUND}/v1/approve", {"revision_id": ing["items"][0]["revision_id"], "approver": "alice"})  # py knowledge.approve
with psycopg.connect(DB, autocommit=True) as _c:
    kbout = str(_c.execute("SELECT id FROM artifact WHERE project_id=%s AND type='kb_outline' ORDER BY version DESC LIMIT 1", (pid,)).fetchone()[0])
post(f"{GROUND}/v1/release", {"project_id": pid, "kb_outline_artifact_id": kbout})  # py writes kb_release artifact
print("  generated mixed TS + Python audit events\n")

print("── Chain is valid across writers ──")
v = verify()
ok(f"chain valid, {v['count']} events") if v.get("ok") and v["count"] >= 5 else bad(f"chain invalid: {v}")

with psycopg.connect(DB, autocommit=True) as conn:
    acts = dict(conn.execute(
        "SELECT action, count(*) FROM audit_event WHERE project_id=%s GROUP BY action", (pid,)).fetchall())
    mixed = acts.get("artifact.create", 0) >= 4 and acts.get("knowledge.approve", 0) >= 1
    ok(f"both writers contributed: {acts}") if mixed else bad(f"writers not mixed: {acts}")
    by_actor = conn.execute(
        "SELECT actor, count(*) FROM audit_event GROUP BY actor ORDER BY 2 DESC LIMIT 4").fetchall()
    print(f"    actors: {dict(by_actor)}")
    last_id, last_actor = conn.execute("SELECT id, actor FROM audit_event ORDER BY id DESC LIMIT 1").fetchone()

    print("\n── WORM: the audit log rejects mutation ──")
    try:
        conn.execute("UPDATE audit_event SET actor='hacker' WHERE id=%s", (last_id,))
        bad("UPDATE was allowed (WORM not enforced)")
    except psycopg.errors.RaiseException:
        ok("UPDATE blocked by WORM trigger")
    try:
        conn.execute("DELETE FROM audit_event WHERE id=%s", (last_id,))
        bad("DELETE was allowed (WORM not enforced)")
    except psycopg.errors.RaiseException:
        ok("DELETE blocked by WORM trigger")

    print("\n── Tamper detection (bypass the trigger, then restore) ──")
    conn.execute("ALTER TABLE audit_event DISABLE TRIGGER trg_audit_no_update")
    conn.execute("UPDATE audit_event SET actor='TAMPERED' WHERE id=%s", (last_id,))
    v2 = verify()
    ok(f"tamper detected ({v2.get('reason')} at #{v2.get('broken_at')})") if not v2.get("ok") else bad("tamper NOT detected")
    conn.execute("UPDATE audit_event SET actor=%s WHERE id=%s", (last_actor, last_id))   # restore
    conn.execute("ALTER TABLE audit_event ENABLE TRIGGER trg_audit_no_update")
    v3 = verify()
    ok("chain valid again after restore") if v3.get("ok") else bad(f"chain still broken after restore: {v3}")

print("\n" + "=" * 40)
print(f"  H1 (audit) verification: {PASS} passed, {FAIL} failed")
print("=" * 40)
print("  ✅ H1 GREEN" if FAIL == 0 else "  ❌ H1 not green")
raise SystemExit(0 if FAIL == 0 else 1)
