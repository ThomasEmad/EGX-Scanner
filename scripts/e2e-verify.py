#!/usr/bin/env python3
"""End-to-end verification of the production-readiness patch set."""
import json
import subprocess
import urllib.request
import urllib.error

BASE = "http://localhost:3000"
PASS, FAIL = [], []


def req(method, path, body=None, headers=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    def lower(h):
        return {k.lower(): v for k, v in h.items()}
    try:
        resp = urllib.request.urlopen(r, timeout=20)
        return resp.status, lower(resp.headers), resp.read().decode()[:500]
    except urllib.error.HTTPError as e:
        return e.code, lower(e.headers), e.read().decode()[:500]


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(("  ✓ " if cond else "  ✗ ") + name + (f"  [{detail}]" if detail and not cond else ""))


print("— health —")
st, hd, body = req("GET", "/api/v1/health")
d = json.loads(body)
check("health 200 + ok", st == 200 and d.get("ok") is True)
check("health enriched (uptime/memory/version)",
      all(k in d for k in ("uptimeSec", "memoryRssMb", "version", "dbLatencyMs")))

print("— register → httpOnly cookie —")
import time as _t
email = "e2e-verify-20261106c@test.local"
st, hd, body = req("POST", "/api/v1/auth/register",
                   {"email": email, "password": "E2eTest#2026x", "name": "E2E Verify"})
token = ""
try:
    token = json.loads(body).get("token", "")
except Exception:
    pass
sc = hd.get("set-cookie", "")
check("register 201", st == 201, f"status={st} body={body[:120]}")
check("Set-Cookie present", "egx-user-token=" in sc, sc[:120])
check("cookie HttpOnly", "HttpOnly" in sc)
check("cookie Secure", "Secure" in sc)
check("cookie SameSite=Lax", "SameSite=Lax" in sc)
check("token returned", len(token) > 10)

print("— me: no-store —")
st, hd, _ = req("GET", "/api/v1/auth/me", headers={"x-session-token": token})
check("me 200", st == 200)
check("me Cache-Control no-store", "no-store" in hd.get("cache-control", ""))

print("— login failure audited —")
st, _, _ = req("POST", "/api/v1/auth/login", {"email": email, "password": "wrong-password-1"})
check("bad login 401", st == 401)
# the LOGIN_FAILED audit row lands in AuditLog; verify via admin audit API
pas = subprocess.run(
    "grep ADMIN_PASSCODE /tmp/my-project/.env | cut -d= -f2",
    shell=True, capture_output=True, text=True).stdout.strip()
st, _, body = req("POST", "/api/v1/admin/login", {"passcode": pas})
admin_cookie = ""
for part in hd.get("set-cookie", "").split(";"):
    if part.strip().startswith("egx_admin_session="):
        admin_cookie = part.strip()
st, _, body = req("GET", "/api/v1/admin/audit?limit=5",
                  headers={"Cookie": admin_cookie} if admin_cookie else {})
found = False
if st == 200:
    try:
        rows = json.loads(body).get("audit", json.loads(body) if isinstance(json.loads(body), list) else [])
        if isinstance(rows, dict):
            rows = rows.get("rows") or rows.get("audit") or []
        found = any(r.get("action") == "LOGIN_FAILED" for r in rows if isinstance(r, dict))
    except Exception:
        found = "LOGIN_FAILED" in body
check("LOGIN_FAILED in audit feed", found, f"status={st}")

print("— change password —")
st, hd, body = req("POST", "/api/v1/auth/change-password",
                   {"currentPassword": "E2eTest#2026x", "newPassword": "E2eTest#2027y"},
                   headers={"x-session-token": token})
check("change-password 200", st == 200, f"status={st} {body[:120]}")
st, _, _ = req("POST", "/api/v1/auth/login", {"email": email, "password": "E2eTest#2027y"})
check("login with NEW password 200", st == 200, f"status={st}")
st, _, _ = req("POST", "/api/v1/auth/login", {"email": email, "password": "E2eTest#2026x"})
check("login with OLD password 401", st == 401)

print("— session endpoint (OAuth finish flow) —")
st, _, body = req("POST", "/api/v1/auth/login", {"email": email, "password": "E2eTest#2027y"})
tok2 = json.loads(body).get("token", "")
st, hd, _ = req("POST", "/api/v1/auth/session", headers={"x-session-token": tok2})
check("session endpoint sets cookie", st == 200 and "HttpOnly" in hd.get("set-cookie", ""), f"status={st}")

print("— static/UX —")
st, hd, body = req("GET", "/manifest.webmanifest")
check("manifest lang ar-EG", st == 200 and '"lang":"ar-EG"' in body.replace(" ", ""), body[:120] if st != 200 else "")
st, _, body = req("GET", "/login")
check("/login renders + title present", st == 200 and "<title" in body)
st, _, body = req("GET", "/companies")
check("/companies 200 + footer rendered", st == 200 and ("إخلاء" in body or "Disclaimer" in body))
st, _, body = req("GET", "/api/hello-check-404")
check("old hello-world API gone", st == 404)

print("— logout clears cookie —")
st, hd, _ = req("POST", "/api/v1/auth/logout", headers={"x-session-token": tok2})
check("logout 200 + cookie cleared", st == 200 and "Max-Age=0" in hd.get("set-cookie", ""), f"status={st}")

print(f"\nRESULT: {len(PASS)} passed, {len(FAIL)} failed")
if FAIL:
    print("FAILED:", FAIL)
