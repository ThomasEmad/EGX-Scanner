import re, os, subprocess

root = "/tmp/my-project/src"
hrefs = set()
for dirpath, _, files in os.walk(root):
    for f in files:
        if not f.endswith((".tsx", ".ts")): continue
        p = os.path.join(dirpath, f)
        try: s = open(p, encoding="utf-8").read()
        except: continue
        for m in re.finditer(r'href:\s*"(/[^"]*)"', s): hrefs.add(m.group(1))
        for m in re.finditer(r'href="(/[^"]*)"', s): hrefs.add(m.group(1))
        for m in re.finditer(r'router\.push\("(/[^"]*)"\)', s): hrefs.add(m.group(1))
        for m in re.finditer(r'Link href="(/[^"]*)"', s): hrefs.add(m.group(1))

# real routes: directories with page.tsx + app-level files
routes = set()
app = os.path.join(root, "app")
for dirpath, dirs, files in os.walk(app):
    if "page.tsx" in files:
        rel = os.path.relpath(dirpath, app)
        route = "/" + rel if rel != "." else "/"
        routes.add(route.split("[")[0].rstrip("/"))
    for f in ("sitemap.ts",):
        pass

results = []
for h in sorted(hrefs):
    base = h.split("#")[0].rstrip("/") or "/"
    # dynamic route segments like /company/[id] — check prefix match
    ok = any(base == r or base.startswith(r + "/") or r and base.startswith(r) for r in routes if r)
    if h.startswith("/api/"): ok = True
    results.append((h, "OK" if ok else "BROKEN?"))

broken = [r for r in results if r[1] != "OK"]
print(f"total internal hrefs: {len(results)}")
for h, st in broken: print(f"  {st}: {h}")
