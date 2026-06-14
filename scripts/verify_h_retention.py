"""H3 verification — retention purge + DSAR (export/erase), audited.

Proves: chat is attributed to a data subject; DSAR export returns their data;
retention purge removes aged rows; DSAR erase removes the subject's data; both
are audited; and access is gated by data:admin.
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

PASS = FAIL = 0
ok = lambda m: (globals().__setitem__("PASS", PASS + 1), print(f"  ✓ {m}"))  # noqa: E731
bad = lambda m: (globals().__setitem__("FAIL", FAIL + 1), print(f"  ✗ {m}"))  # noqa: E731


def opener():
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def call(op, method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{CONSOLE}{path}", data=data,
                                 headers={"Content-Type": "application/json"}, method=method)
    try:
        r = op.open(req, timeout=90)
        return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def post(url, body, timeout=90):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read() or b"{}")


alice = opener()
alice.open(urllib.request.Request(f"{CONSOLE}/api/dev-login?user=alice", data=b"", method="POST"))
slug = f"h-ret-{int(time.time())}"
_, proj = call(alice, "POST", "/api/projects", {"name": "H Ret", "slug": slug, "domain": "banking"})
pid = proj["id"]
call(alice, "POST", "/api/specify", {"projectId": pid, "topic": "UK current account overdraft help"})
ing = post(f"{GROUND}/v1/ingest", {"project_id": pid, "submitted_by": "bob", "docs": [
    {"uri": "doc/x", "title": "X", "body": "# Overdraft\n\n39.9% EAR variable; no fee below 50 pounds."}]})
post(f"{GROUND}/v1/approve", {"revision_id": ing["items"][0]["revision_id"], "approver": "alice"})
with psycopg.connect(DB) as c:
    kbout = str(c.execute("SELECT id FROM artifact WHERE project_id=%s AND type='kb_outline' ORDER BY version DESC LIMIT 1", (pid,)).fetchone()[0])
post(f"{GROUND}/v1/release", {"project_id": pid, "kb_outline_artifact_id": kbout})
_, av = call(alice, "POST", "/api/agent/build", {"projectId": pid})
avid = av["agent_version_id"]

print("── Subject-attributed chat logs ──")
call(alice, "POST", "/api/chat", {"agentVersionId": avid, "question": "What is the overdraft rate?"})
call(alice, "POST", "/api/chat", {"agentVersionId": avid, "question": "Any fee under 50 pounds?"})
call(alice, "POST", "/api/academy/progress", {"path": "conversation-designer", "stageId": "specify"})
with psycopg.connect(DB, autocommit=True) as conn:
    n = conn.execute("SELECT count(*) FROM chat_log WHERE user_id='alice'").fetchone()[0]
    # a synthetic AGED log row for the retention test
    conn.execute("INSERT INTO chat_log (project_id, agent_version_id, question, answer, user_id, created_at) "
                 "VALUES (%s,%s,'old','old','ghost', now() - interval '400 days')", (pid, avid))
ok(f"chat attributed to subject (alice has {n} logs)") if n >= 2 else bad(f"expected >=2 alice logs, got {n}")

print("\n── DSAR access (export) ──")
_, exp = call(alice, "GET", "/api/admin/dsar?user_id=alice")
ok(f"DSAR export returns subject data ({len(exp['chat_log'])} chats, {len(exp['academy_progress'])} academy)") \
    if len(exp.get("chat_log", [])) >= 2 and len(exp.get("academy_progress", [])) >= 1 else bad(f"export incomplete: {exp}")

print("\n── Retention purge (aged rows) ──")
_, pr = call(alice, "POST", "/api/admin/retention", {"days": 365})
with psycopg.connect(DB, autocommit=True) as conn:
    ghost = conn.execute("SELECT count(*) FROM chat_log WHERE user_id='ghost'").fetchone()[0]
    alive = conn.execute("SELECT count(*) FROM chat_log WHERE user_id='alice'").fetchone()[0]
ok(f"purged {pr.get('purged')} aged row(s); recent rows survive ({alive})") if pr.get("purged", 0) >= 1 and ghost == 0 and alive >= 2 else bad(f"purge wrong: purged={pr} ghost={ghost} alive={alive}")

print("\n── DSAR erasure ──")
_, er = call(alice, "POST", "/api/admin/dsar", {"user_id": "alice"})
with psycopg.connect(DB, autocommit=True) as conn:
    left = conn.execute("SELECT count(*) FROM chat_log WHERE user_id='alice'").fetchone()[0]
    aleft = conn.execute("SELECT count(*) FROM academy_progress WHERE user_id='alice'").fetchone()[0]
ok(f"erased subject data ({er['erased']}); nothing remains") if left == 0 and aleft == 0 else bad(f"erase incomplete: left={left} academy={aleft}")

print("\n── Audit + RBAC ──")
av_chain = json.loads(alice.open(urllib.request.Request(f"{CONSOLE}/api/audit/verify")).read())
with psycopg.connect(DB, autocommit=True) as conn:
    actions = {r[0] for r in conn.execute("SELECT DISTINCT action FROM audit_event WHERE action IN ('dsar.erase','retention.purge')").fetchall()}
ok("retention + DSAR actions are audited, chain valid") if av_chain.get("ok") and {"dsar.erase", "retention.purge"} <= actions else bad(f"audit gap: chain={av_chain.get('ok')} actions={actions}")

bob = opener()
bob.open(urllib.request.Request(f"{CONSOLE}/api/dev-login?user=bob", data=b"", method="POST"))
code, _ = call(bob, "GET", "/api/admin/dsar?user_id=alice")
ok("viewer blocked from DSAR (403)") if code == 403 else bad(f"viewer got {code}")

print("\n" + "=" * 40)
print(f"  H3 (retention/DSAR) verification: {PASS} passed, {FAIL} failed")
print("=" * 40)
print("  ✅ H3 GREEN" if FAIL == 0 else "  ❌ H3 not green")
raise SystemExit(0 if FAIL == 0 else 1)
