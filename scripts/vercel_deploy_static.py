#!/usr/bin/env python3
"""Deploy a minimal placeholder page to all portfolio projects (static, production)."""
import concurrent.futures as cf
import hashlib, json, sys, time, urllib.request, urllib.error

TOKEN = open("/tmp/vercel_token").read().strip()
API = "https://api.vercel.com"

INDEX_HTML = """<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Thomas Emad | Site under setup</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0e1116;color:#e7ecf3;
       font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;text-align:center}
  .card{padding:48px 32px;max-width:560px}
  h1{font-size:28px;font-weight:600;margin:0 0 12px}
  p{color:#9aa7b8;font-size:15px;line-height:1.8;margin:6px 0}
  .en{direction:ltr}
  .dot{width:10px;height:10px;border-radius:50%;background:#38bdf8;display:inline-block;
       margin-inline-end:10px;box-shadow:0 0 14px #38bdf8}
</style>
</head>
<body>
  <main class="card">
    <h1><span class="dot"></span>الموقع قيد الإعداد</h1>
    <p>النسخة الجديدة من الموقع قيد التحضير وستُنشر قريباً.</p>
    <p class="en">This site is being set up — a new version is on its way.</p>
  </main>
</body>
</html>
""".encode("utf-8")

PROJECTS = [
    "my-portfolio-47o1", "my-portfolio", "my-portfolio-zzoh",
    "my-portfolio-iwnp", "my-portfolio2", "my-portfolio-wtwy", "my_portfolio",
]
SHA = hashlib.sha1(INDEX_HTML).hexdigest()


def api(method, path, body=None, data=None, headers=None):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else data, method=method)
    req.add_header("Authorization", "Bearer " + TOKEN)
    if body is not None:
        req.add_header("Content-Type", "application/json")
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw.strip().startswith(("{", "[")) else raw)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw[:300]}


def deploy_one(name):
    files = [{"file": "index.html", "sha": SHA, "size": len(INDEX_HTML)}]
    body = {
        "name": name,
        "target": "production",
        "files": files,
        "projectSettings": {"framework": None, "buildCommand": None, "installCommand": None,
                            "outputDirectory": None, "rootDirectory": None},
    }
    for attempt in range(4):
        st, dep = api("POST", "/v13/deployments?skipAutoDetectionConfirmation=1", body)
        if st in (200, 201):
            break
        err = dep.get("error", dep)
        if isinstance(err, str):
            try:
                err = json.loads(err)
            except Exception:
                err = {}
        if st == 400 and err.get("code") == "missing_files":
            st2, _ = api("POST", "/v2/files", data=INDEX_HTML,
                         headers={"x-vercel-digest": SHA, "Content-Type": "application/octet-stream"})
            if st2 not in (200, 201, 409):
                return name, None, f"upload failed HTTP {st2}"
            continue
        return name, None, f"create failed HTTP {st} {json.dumps(dep)[:200]}"
    else:
        return name, None, "create loop exhausted"

    did = dep["id"]
    for _ in range(30):
        time.sleep(4)
        st, d = api("GET", f"/v13/deployments/{did}")
        rs = d.get("readyState")
        if rs == "READY":
            return name, did, d.get("alias", [])
        if rs in ("ERROR", "CANCELED"):
            return name, did, f"build {rs}"
    return name, did, "timeout"


results = {}
with cf.ThreadPoolExecutor(max_workers=4) as ex:
    for name, did, info in ex.map(deploy_one, PROJECTS):
        results[name] = (did, info)
        print(f"{name}: {info}", flush=True)

# ensure production domains point at the new deployments
print("--- alias check ---", flush=True)
for name, (did, info) in results.items():
    if not did:
        continue
    st, d = api("GET", f"/v13/deployments/{did}")
    aliases = set(d.get("alias", []))
    st2, doms = api("GET", f"/v9/projects/{name}/domains")
    for dm in doms.get("domains", []):
        dn = dm["name"]
        if dn.endswith(".com") or dn not in aliases:
            # custom domains or missing production alias -> assign explicitly
            st3, a = api("POST", f"/v2/deployments/{did}/aliases", {"alias": dn})
            print(f"  alias {dn} -> {name}: HTTP {st3}", flush=True)

# cleanup temporary inspection aliases
print("--- cleanup temp aliases ---", flush=True)
for t in ("iwnp-old-inspect-thomasemads-projects.vercel.app",
          "zzoh-old-inspect-thomasemads-projects.vercel.app"):
    st, a = api("GET", f"/v4/aliases/{t}") if False else (None, None)
    req = urllib.request.Request(API + f"/v3/deployments/dpl_B54BcDzBsJqcKbV3WP9xD19QPNe8/aliases/{t}", method="DELETE") if t.startswith("iwnp") else urllib.request.Request(API + f"/v3/deployments/dpl_GNQTfrPnT8TUqueTPPgHKZCFQiEA/aliases/{t}", method="DELETE")
    req.add_header("Authorization", "Bearer " + TOKEN)
    try:
        urllib.request.urlopen(req, timeout=30)
        print("  deleted", t, flush=True)
    except urllib.error.HTTPError as e:
        print(f"  cleanup {t}: HTTP {e.code}", flush=True)

print("--- DONE ---", flush=True)
