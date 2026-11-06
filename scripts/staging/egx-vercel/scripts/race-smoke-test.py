#!/usr/bin/env python3
"""Runtime race-condition smoke test against the live server.

Flow: register 2 users → concurrent subscription requests (dedup check) →
concurrent portfolio adds (free-limit check) → admin verify/reject single-winner
claim → SSE stream cap sanity. Reads secrets from .env without printing them.
"""
import concurrent.futures as cf
import os
import re
import sqlite3
import urllib.request
import urllib.error

BASE = "http://localhost:3000/api/v1"


def call(method, path, body=None, token=None, cookie=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("x-session-token", token)
    if cookie:
        req.add_header("Cookie", cookie)
    data = None
    if body is not None:
        data = (body if isinstance(body, str) else __import__("json").dumps(body)).encode()
    try:
        with urllib.request.urlopen(req, data) as r:
            return r.status, r.read().decode()[:400]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:400]


def db_query(q):
    con = sqlite3.connect(os.path.expanduser("~/my-project/db/custom.db"))
    try:
        return con.execute(q).fetchall()
    finally:
        con.close()


def db_path():
    env = open(os.path.expanduser("~/my-project/.env")).read()
    m = re.search(r"DATABASE_URL\s*=\s*\"?([^\"\n]+)\"?", env)
    raw = m.group(1).replace("file:", "").strip() if m else os.path.expanduser("~/my-project/db/custom.db")
    return raw if os.path.isabs(raw) else os.path.join(os.path.expanduser("~/my-project"), raw)


def main():
    path = db_path()
    print("db:", path)

    import json, time
    results = {}

    # --- fresh user (register, or log in if it already exists / rate limited) ---
    suffix = str(int(time.time()))
    email = f"alice{suffix}@race.test"
    st, body = call("POST", "/auth/register", {"email": email, "password": "Passw0rd!123", "name": "alice"})
    token = re.search(r'"token":"([^"]+)"', body)
    if token:
        results["alice"] = token.group(1)
        print(f"register alice: {st} token=yes")
    else:
        # fall back to login (user exists from a previous run)
        st2, body2 = call("POST", "/auth/login", {"email": email, "password": "Passw0rd!123"})
        token2 = re.search(r'"token":"([^"]+)"', body2)
        results["alice"] = token2.group(1) if st2 == 200 and token2 else None
        print(f"register alice: {st} ({body[:80]}) -> login fallback: {st2} token={'yes' if results['alice'] else 'no'}")

    if not results["alice"]:
        print("FATAL: no user token — aborting")
        return

    # --- race 1: 4 concurrent subscription requests from alice ---
    with cf.ThreadPoolExecutor(8) as ex:
        futs = [ex.submit(call, "POST", "/subscription/request", {"notes": f"n{i}"}, results["alice"]) for i in range(4)]
        outs = [f.result() for f in futs]
    codes = [s for s, _ in outs]
    con = sqlite3.connect(path)
    email = f"alice{suffix}@race.test"
    uid = con.execute("SELECT id FROM User WHERE email=?", (email,)).fetchone()[0]
    subs = con.execute("SELECT COUNT(*) FROM Subscription WHERE userId=?", (uid,)).fetchone()[0]
    prs = con.execute("SELECT COUNT(*) FROM PaymentRequest WHERE userId=?", (uid,)).fetchone()[0]
    con.close()
    print(f"race1 sub-request x4 concurrent -> statuses {codes} | subscriptions={subs} (expect 1) | paymentRequests={prs} (expect 1)")

    # --- race 2: portfolio free-limit (FREE_LIMIT=2): 5 concurrent adds of 5 different companies ---
    con = sqlite3.connect(path)
    companies = [r[0] for r in con.execute("SELECT id FROM Company WHERE isActive=1 LIMIT 5").fetchall()]
    con.close()
    with cf.ThreadPoolExecutor(8) as ex:
        futs = [ex.submit(call, "POST", "/portfolio", {"companyId": c, "quantity": 10, "avgCost": 5}, results["alice"]) for c in companies]
        outs = [f.result() for f in futs]
    created = sum(1 for s, _ in outs if s in (200, 201))
    limited = sum(1 for s, _ in outs if s == 403)
    con = sqlite3.connect(path)
    held = con.execute("SELECT COUNT(*) FROM PortfolioHolding WHERE userId=?", (uid,)).fetchone()[0]
    con.close()
    print(f"race2 portfolio x5 concurrent -> created={created} limited={limited} | holdings_in_db={held} (expect <=2 for free user)")

    # --- race 3: admin verify single-winner on a PENDING request ---
    env = open(os.path.expanduser("~/my-project/.env")).read()
    passcode = re.search(r"ADMIN_PASSCODE\s*=\s*\"?([^\"\n]+)\"?", env).group(1)
    st, body = call("POST", "/admin/login", {"passcode": passcode})
    setcookie = None
    req = urllib.request.Request(BASE + "/admin/login", method="POST")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, json.dumps({"passcode": passcode}).encode()) as r:
        setcookie = r.headers.get("Set-Cookie")
    admin_cookie = setcookie.split(";")[0] if setcookie else None
    print(f"admin login: {st} cookie={'yes' if admin_cookie else 'MISSING'}")

    con = sqlite3.connect(path)
    pr_id = con.execute("SELECT id FROM PaymentRequest WHERE userId=? AND status='PENDING' ORDER BY createdAt DESC LIMIT 1", (uid,)).fetchone()
    con.close()
    if pr_id and admin_cookie:
        pid = pr_id[0]
        with cf.ThreadPoolExecutor(4) as ex:
            f_verify = ex.submit(call, "POST", f"/admin/payment-requests/{pid}/verify", None, None, admin_cookie)
            f_reject = ex.submit(call, "POST", f"/admin/payment-requests/{pid}/reject", {"adminNote": "race test"}, None, admin_cookie)
            v_s, v_b = f_verify.result()
            r_s, r_b = f_reject.result()
        con = sqlite3.connect(path)
        final_status = con.execute("SELECT status FROM PaymentRequest WHERE id=?", (pid,)).fetchone()[0]
        sub_status = con.execute("SELECT status FROM Subscription WHERE userId=?", (uid,)).fetchone()[0]
        sub_count = con.execute("SELECT COUNT(*) FROM Subscription WHERE userId=?", (uid,)).fetchone()[0]
        con.close()
        print(f"race3 verify+reject concurrent -> verify={v_s} reject={r_s} | final PR status={final_status} (one winner) | sub status={sub_status} subs={sub_count} (expect 1 row)")

    # --- race 4: SSE stream cap — open 3 short-lived connections, then confirm server still healthy ---
    import threading
    def sip():
        try:
            with urllib.request.urlopen(BASE.replace("/api/v1", "") + "/api/v1/market/stream") as r:
                r.read(120)  # read a little then close
        except Exception as e:
            pass
    threads = [threading.Thread(target=sip) for _ in range(3)]
    for t in threads: t.start()
    for t in threads: t.join(timeout=8)
    st, _ = call("GET", "/health")
    print(f"race4 sse x3 then health: {st} (expect 200)")


if __name__ == "__main__":
    main()
