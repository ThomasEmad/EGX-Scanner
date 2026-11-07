#!/usr/bin/env python3
"""Deploy /tmp/egx-deploy/app to Vercel via API: create -> upload missing (/v2/files) -> recreate -> poll."""
import concurrent.futures as cf
import hashlib, json, os, sys, time, urllib.request, urllib.error

TOKEN = open("/tmp/vercel_token").read().strip()
API = "https://api.vercel.com"
ROOT = "/tmp/egx-deploy/app"
PROJECT = "meza"

EXCLUDE_DIRS = {"node_modules", ".next", ".git", ".turbo", ".vercel", "dist", "build", "coverage", ".cache"}
EXCLUDE_FILES = {".env", ".env.local", ".DS_Store", "tsconfig.tsbuildinfo", "dev.log"}


def collect():
    items = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for fn in filenames:
            if fn in EXCLUDE_FILES or fn.endswith((".db", ".tsbuildinfo", ".log")) or fn.startswith(".env."):
                continue
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, ROOT).replace(os.sep, "/")
            items.append((rel, full))
    return items


def sha1(path):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        h.update(f.read())
    return h.hexdigest()


def api(method, path, body=None, data=None, headers=None):
    url = f"{API}{path}"
    b = json.dumps(body).encode() if body is not None else data
    req = urllib.request.Request(url, data=b, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    if body is not None:
        req.add_header("Content-Type", "application/json")
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw.strip().startswith(("{", "[")) else raw)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw[:800]}


files = collect()
manifest = []
blob = {}
for rel, full in files:
    digest = sha1(full)
    manifest.append({"file": rel, "sha": digest, "size": os.path.getsize(full)})
    blob[digest] = full
print(f"files: {len(manifest)}  total: {sum(m['size'] for m in manifest)/1e6:.1f} MB")


def upload_file(sha):
    path = blob[sha]
    for attempt in range(4):
        st, res = api("POST", "/v2/files", data=open(path, "rb").read(),
                      headers={"x-vercel-digest": sha, "Content-Type": "application/octet-stream"})
        if st in (200, 201, 409):  # 409 = already stored
            return True
        time.sleep(1 + attempt)
    print(f"  upload FAILED {path}: HTTP {st} {json.dumps(res)[:200]}", flush=True)
    return False


def create():
    body = {
        "name": PROJECT,
        "target": "production",
        "files": manifest,
        "projectSettings": {
            "framework": "nextjs",
            "buildCommand": None,
            "installCommand": None,
            "outputDirectory": None,
            "rootDirectory": None,
        },
    }
    return api("POST", "/v13/deployments?skipAutoDetectionConfirmation=1", body)


did = None
for round_no in range(6):
    st, dep = create()
    if st in (200, 201):
        did = dep["id"]
        print(f"deployment created: {did} ({dep.get('readyState')})")
        break
    err = dep.get("error") if isinstance(dep, dict) else dep
    if isinstance(err, str):
        try:
            err = json.loads(err)
        except Exception:
            err = {"raw": err[:400]}
    if st == 400 and err.get("code") == "missing_files":
        missing = err.get("missing", [])
        shas = [m if isinstance(m, str) else m.get("sha") for m in missing if (isinstance(m, str) or m.get("sha") in blob)]
        print(f"round {round_no+1}: {len(shas)} files missing -> uploading ...")
        fails = 0
        with cf.ThreadPoolExecutor(max_workers=8) as ex:
            for i, okf in enumerate(ex.map(upload_file, shas), 1):
                fails += 0 if okf else 1
                if i % 300 == 0:
                    print(f"  uploaded {i}/{len(shas)}", flush=True)
        print(f"upload round {round_no+1} done, failures: {fails}")
        if fails:
            sys.exit(1)
    else:
        print(f"UNEXPECTED create response: HTTP {st} {json.dumps(dep)[:800]}")
        sys.exit(1)
if not did:
    print("could not create deployment after upload rounds")
    sys.exit(1)

print("polling build ...")
final = None
for i in range(220):
    time.sleep(8)
    st, d = api("GET", f"/v13/deployments/{did}")
    rs = d.get("readyState", "?")
    print(f"  [{i*8:3d}s] {rs}", flush=True)
    if rs in ("READY", "ERROR", "CANCELED"):
        final = d
        break
if not final:
    print("TIMEOUT waiting for build")
    sys.exit(1)

if final["readyState"] == "READY":
    print(json.dumps({
        "url": final.get("url"),
        "aliases": final.get("alias"),
        "inspect": f"https://vercel.com/thomasemads-projects/{PROJECT}/deployments/{did}",
    }, ensure_ascii=False, indent=1))
else:
    st, ev = api("GET", f"/v2/deployments/{did}/events?limit=200")
    lines = []
    if isinstance(ev, list):
        for e in ev:
            if isinstance(e, dict) and isinstance(e.get("payload"), dict):
                t = e["payload"].get("text", "")
                if t.strip():
                    lines.append(t.rstrip())
    print("\n".join(lines[-50:]) or "(no log text)")
    sys.exit(1)
