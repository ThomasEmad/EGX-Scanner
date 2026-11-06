#!/usr/bin/env python3
"""Repair portfolio projects: trigger production git deploys, poll, verify domains."""
import json, time, urllib.request, urllib.error

TOKEN = open("/tmp/vercel_token").read().strip()
API = "https://api.vercel.com"
PROJECTS = ["my-portfolio", "my-portfolio-zzoh", "my-portfolio-iwnp", "my-portfolio2", "my-portfolio-wtwy", "my_portfolio"]
TRIAL = "dpl_2ck4sSRXbHNv6DoqmENPtHoyJGiu"  # already running for my-portfolio-47o1
DOMAINS = [
    "y-portfolio-47o1.vercel.app", "y-portfolio-zzoh.vercel.app", "y-portfolio-tau-three-50.vercel.app",
    "thomas.com", "www.thomas.com", "my-portfolio-iwnp.vercel.app",
    "y-portfolio2-livid.vercel.app", "y-portfolio-wtwy.vercel.app",
    "myportfolio-jet-iota.vercel.app",
]


def api(method, path, body=None):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode() if body else None, method=method)
    req.add_header("Authorization", "Bearer " + TOKEN)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            raw = r.read().decode()
            return r.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


def head(url):
    req = urllib.request.Request("https://" + url + "/", method="GET")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception as e:
        return str(e)[:40]


deploys = {TRIAL: "my-portfolio-47o1"}
for p in PROJECTS:
    st, d = api("POST", "/v13/deployments?skipAutoDetectionConfirmation=1",
                {"name": p, "target": "production",
                 "gitSource": {"type": "github", "org": "ThomasEmad", "repo": "my_portfolio", "ref": "main"}})
    if st in (200, 201):
        deploys[d["id"]] = p
        print(f"triggered {p}: {d['id']} ({d.get('readyState')})", flush=True)
    else:
        print(f"TRIGGER FAILED {p}: HTTP {st} {json.dumps(d)[:300]}", flush=True)

print(f"--- polling {len(deploys)} deployments ...", flush=True)
pending = dict(deploys)
for i in range(60):
    time.sleep(15)
    done = []
    for did, name in pending.items():
        st, d = api("GET", f"/v13/deployments/{did}")
        rs = d.get("readyState", "?")
        print(f"  [{i*15:4d}s] {name} {rs}", flush=True)
        if rs in ("READY", "ERROR", "CANCELED"):
            done.append(did)
            if rs == "ERROR":
                st2, ev = api("GET", f"/v2/deployments/{did}/events?limit=30")
                txt = "\n".join(str(e)[:200] for e in ev if isinstance(e, list) or isinstance(e, dict))[:1000] if isinstance(ev, list) else str(ev)[:1000]
                print(f"  ERROR details {name}: {txt}", flush=True)
    for did in done:
        pending.pop(did)
    if not pending:
        break

print("--- domain checks ---", flush=True)
for d in DOMAINS:
    print(f"  {head(d)}  {d}", flush=True)
print("--- REPAIR SCRIPT DONE ---", flush=True)
