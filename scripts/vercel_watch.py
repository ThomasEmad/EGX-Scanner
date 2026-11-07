#!/usr/bin/env python3
"""Watch deployments until done. Usage: vercel_watch.py <max_seconds>"""
import json, sys, time, urllib.request, urllib.error

TOKEN = open("/tmp/vercel_token").read().strip()
API = "https://api.vercel.com"
MAX = int(sys.argv[1]) if len(sys.argv) > 1 else 480

DEPLOYS = {
    "dpl_2FvBAvJU7ZVNkJuCYFwt3u9B3ssY": "meza",
    "dpl_2ck4sSRXbHNv6DoqmENPtHoyJGiu": "my-portfolio-47o1",
    "dpl_CwJkwggRRrUwmeixd3pSjsEHDJig": "my-portfolio",
    "dpl_3H9jRGTuN6gJqoffENKcjJyEdAYK": "my-portfolio-zzoh",
    "dpl_7dG4ZyF3cKKoF58DkafHeovpaPbH": "my-portfolio-iwnp",
    "dpl_3ueqAGsXGyGPQVwZ4zRfz2uQ1aXJ": "my-portfolio2",
    "dpl_5ZQNd3H7g6YNnQB4HehGkKCFgvQZ": "my-portfolio-wtwy",
    "dpl_EDpSWq6kDGkq1rdZ6jwDEzrQ8xK8": "my_portfolio",
}


def api(method, path):
    req = urllib.request.Request(API + path, method=method)
    req.add_header("Authorization", "Bearer " + TOKEN)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw.strip().startswith(("{", "[")) else raw)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


states = {}
start = time.time()
while time.time() - start < MAX:
    states = {}
    for did, name in DEPLOYS.items():
        st, d = api("GET", f"/v13/deployments/{did}")
        states[did] = d.get("readyState", f"?({st})")
    summary = " | ".join(f"{n[:14]}={s[:7]}" for n, s in [(v, k2) for k2, v in [(DEPLOYS[did], states[did]) for did in DEPLOYS]])
    print(f"[{int(time.time()-start):4d}s] " + " | ".join(f"{DEPLOYS[did][:13]}={states[did][:9]}" for did in DEPLOYS), flush=True)
    if all(s in ("READY", "ERROR", "CANCELED") for s in states.values()):
        break
    time.sleep(25)

print()
for did, name in DEPLOYS.items():
    st, d = api("GET", f"/v13/deployments/{did}")
    rs = d.get("readyState")
    extra = ""
    if name == "meza":
        extra = f" url={d.get('url')} alias={d.get('alias')}"
    if rs == "ERROR":
        st2, ev = api("GET", f"/v2/deployments/{did}/events?limit=200")
        tail = []
        if isinstance(ev, list):
            for e in ev:
                if isinstance(e, dict) and isinstance(e.get("payload"), dict):
                    t = e["payload"].get("text", "")
                    if t.strip():
                        tail.append(t.rstrip())
        extra = " | LOG-TAIL:\n" + "\n".join(tail[-35:])
    print(f"{name}: {rs}{extra}", flush=True)
