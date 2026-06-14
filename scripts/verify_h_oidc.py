"""H6 verification — real OIDC auth behind getSession().

Proves: a JWT signed by the IdP (verified against its JWKS) authenticates and its
role claim drives RBAC; expired / wrong-issuer tokens are rejected; and the
dev-stub cookie still works alongside (coexistence).
"""
import json
import os
import time
import urllib.request

CONSOLE = os.environ.get("CONSOLE_URL", "http://localhost:3000")
ISSUER = os.environ.get("OIDC_ISSUER_URL", "http://localhost:9099")
PASS = FAIL = 0
ok = lambda m: (globals().__setitem__("PASS", PASS + 1), print(f"  ✓ {m}"))  # noqa: E731
bad = lambda m: (globals().__setitem__("FAIL", FAIL + 1), print(f"  ✗ {m}"))  # noqa: E731


def token(**q):
    qs = "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in q.items())
    return json.loads(urllib.request.urlopen(f"{ISSUER}/token?{qs}", timeout=10).read())["token"]


def create_project(headers):
    slug = f"h-oidc-{int(time.time()*1000)}"
    req = urllib.request.Request(f"{CONSOLE}/api/projects", method="POST",
                                 data=json.dumps({"name": "H OIDC", "slug": slug}).encode(),
                                 headers={"Content-Type": "application/json", **headers})
    try:
        r = urllib.request.urlopen(req, timeout=20)
        return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, {}


import urllib.parse  # noqa: E402

print("── OIDC bearer authenticates + RBAC from the role claim ──")
admin = token(sub="alice", role="admin")
code, proj = create_project({"Authorization": f"Bearer {admin}"})
ok(f"OIDC admin creates a project (201, owner={proj.get('owner')})") if code == 201 and proj.get("owner") == "alice" else bad(f"admin -> {code}")

viewer = token(sub="bob", role="viewer")
code, _ = create_project({"Authorization": f"Bearer {viewer}"})
ok("OIDC viewer blocked by RBAC (403)") if code == 403 else bad(f"viewer -> {code}")

print("\n── Invalid tokens are rejected ──")
expired = token(sub="alice", role="admin", exp="expired")
code, _ = create_project({"Authorization": f"Bearer {expired}"})
ok("expired token rejected (401)") if code == 401 else bad(f"expired -> {code}")

wrong_iss = token(sub="alice", role="admin", iss="http://evil.example")
code, _ = create_project({"Authorization": f"Bearer {wrong_iss}"})
ok("wrong-issuer token rejected (401)") if code == 401 else bad(f"wrong-issuer -> {code}")

garbage = create_project({"Authorization": "Bearer not.a.jwt"})[0]
ok("malformed token rejected (401)") if garbage == 401 else bad(f"garbage -> {garbage}")

print("\n── Dev-stub still works alongside ──")
import http.cookiejar  # noqa: E402
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
op.open(urllib.request.Request(f"{CONSOLE}/api/dev-login?user=alice", data=b"", method="POST"))
req = urllib.request.Request(f"{CONSOLE}/api/projects", method="POST",
                             data=json.dumps({"name": "stub", "slug": f"h-stub-{int(time.time()*1000)}"}).encode(),
                             headers={"Content-Type": "application/json"})
try:
    code = op.open(req, timeout=20).status
except urllib.error.HTTPError as e:
    code = e.code
ok("dev-stub cookie still authenticates (201)") if code == 201 else bad(f"dev-stub -> {code}")

print("\n" + "=" * 40)
print(f"  H6 (OIDC) verification: {PASS} passed, {FAIL} failed")
print("=" * 40)
print("  ✅ H6 GREEN" if FAIL == 0 else "  ❌ H6 not green")
raise SystemExit(0 if FAIL == 0 else 1)
