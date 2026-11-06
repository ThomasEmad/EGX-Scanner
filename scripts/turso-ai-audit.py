#!/usr/bin/env python3
"""Query Turso (v2/pipeline) and print rows: handles the real response shape."""
import json
import subprocess
import sys

REQ_PATH = sys.argv[1] if len(sys.argv) > 1 else "/tmp/ai-audit-req.json"

out = subprocess.run(
    ["/tmp/my-project/scripts/turso-query.sh", REQ_PATH],
    capture_output=True, text=True, timeout=90,
)
raw = out.stdout
start = raw.find("{")
end = raw.rfind("}")
if start < 0 or end <= start:
    print("NO JSON IN RESPONSE:", raw[:400])
    raise SystemExit(1)

d = json.loads(raw[start:end + 1])
for r in d.get("results", []):
    resp = r.get("response", {})
    result = resp.get("result", {})
    rows = result.get("rows", [])
    cols = [c["name"] for c in result.get("cols", [])]
    print("ROWS:", len(rows))
    for row in rows:
        t = dict(zip(cols, [x.get("value") for x in row]))
        print("===")
        print(t.get("createdAt"), "|", t.get("action"), "|", str(t.get("d") or "")[:400])
