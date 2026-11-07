#!/usr/bin/env python3
"""Comprehensive HTTP smoke test for the running Meza server."""
import json, urllib.request, urllib.error, sys

BASE = "http://localhost:3000"

# (path, expected_status, must_contain (optional, case-insensitive))
PAGES = [
    ("/", 200, None),
    ("/dashboard", 200, None),
    ("/rankings", 200, None),
    ("/undervalued", 200, None),
    ("/compare", 200, None),
    ("/dividends", 200, None),
    ("/data-quality", 200, None),
    ("/sectors", 200, None),
    ("/sectors/banks", 200, None),
    ("/premium", 200, None),
    ("/login", 200, None),
    ("/register", 200, None),
    ("/about", 200, None),
    ("/disclaimer", 200, None),
    ("/privacy", 200, None),
    ("/terms", 200, None),
    ("/company/COMI", 200, None),          # big-cap: Commercial International Bank
    ("/company/COMI/report", 200, None),
    ("/sitemap.xml", 200, None),
    ("/robots.txt", 200, None),
    ("/manifest.webmanifest", 200, None),
    ("/this-page-does-not-exist", 404, None),
]

APIS = [
    ("/api/v1/companies", 200),
    ("/api/v1/companies/COMI", 200),
    ("/api/v1/companies/COMI/financials", 200),
    ("/api/v1/companies/COMI/metrics", 200),
    ("/api/v1/companies/COMI/scores", 200),
    ("/api/v1/companies/COMI/snowflake", 200),
    ("/api/v1/companies/COMI/peers", 200),
    ("/api/v1/companies/COMI/events", (200, 403)),  # 403 = premium gate (by design for anonymous)
    ("/api/v1/companies/COMI/dividends", 200),
    ("/api/v1/companies/COMI/prices", 200),
    ("/api/v1/companies/COMI/confidence", 200),
    ("/api/v1/companies/COMI/documents", 200),
    ("/api/v1/companies/COMI/investor-signals", 200),
    ("/api/v1/companies/COMI/coverage", 200),
    ("/api/v1/rankings?metric=revenue", 200),
    ("/api/v1/rankings?metric=revenue_growth", 400),   # growth removed → registry gate must 400
    ("/api/v1/sectors", 200),
    ("/api/v1/dashboard", 200),
    ("/api/v1/dashboard/summary", 200),
    ("/api/v1/dashboard/latest-results", 200),
    ("/api/v1/dashboard/valuation", 200),
    ("/api/v1/undervalued", 200),
    ("/api/v1/events", (200, 403)),  # 403 = premium gate (by design for anonymous)
    ("/api/v1/dividends", 200),
    ("/api/v1/data-quality", 200),
    ("/api/v1/metrics", 200),
    ("/api/v1/market/ticker", 200),
    ("/api/v1/market/breadth", 200),
    ("/api/v1/health", 200),
    ("/api/v1/settings/public", 200),
    ("/api/v1/nonexistent-endpoint", 404),
]

def fetch(path):
    req = urllib.request.Request(BASE + path, headers={"User-Agent": "smoke/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()

def main():
    fails = []
    print(f"{'STATUS':<7} {'BYTES':>9}  PATH")
    for path, want, needle in PAGES:
        status, body = fetch(path)
        text = body.decode("utf-8", "replace")
        ok = status == want and "Application error" not in text
        if ok and needle:
            ok = needle.lower() in text.lower()
        mark = "OK " if ok else "FAIL"
        print(f"{mark} {status:<4} {len(body):>9}  {path}")
        if not ok:
            fails.append((path, status, want))

    print("\n--- APIs ---")
    for path, want in APIS:
        status, body = fetch(path)
        ok = status == want or (isinstance(want, tuple) and status in want)
        # JSON sanity for 200s
        detail = ""
        if status == 200 and path.startswith("/api/"):
            try:
                data = json.loads(body)
                if isinstance(data, dict) and data.get("error"):
                    ok = False
                    detail = f" error-key={str(data.get('error'))[:60]}"
            except Exception:
                ok = False
                detail = " non-JSON"
        mark = "OK " if ok else "FAIL"
        print(f"{mark} {status:<4} {len(body):>9}  {path}{detail}")
        if not ok:
            fails.append((path, status, want))

    print(f"\n{'='*60}")
    if fails:
        print(f"FAILURES: {len(fails)}")
        for f in fails:
            print(f"  {f}")
        sys.exit(1)
    print("ALL SMOKE TESTS PASSED")

if __name__ == "__main__":
    main()
