#!/usr/bin/env python3
"""Generic Turso v2/pipeline query printer: arg1 = requests JSON path."""
import json
import subprocess
import sys

out = subprocess.run(
    ["/tmp/my-project/scripts/turso-query.sh", sys.argv[1]],
    capture_output=True, text=True, timeout=90,
)
raw = out.stdout
start = raw.find("{")
end = raw.rfind("}")
if start < 0 or end <= start:
    print("NO JSON:", raw[:300])
    raise SystemExit(1)
d = json.loads(raw[start:end + 1])
for r in d.get("results", []):
    resp = r.get("response", {})
    err = r.get("error")
    if err:
        print("ERROR:", err)
        continue
    result = resp.get("result", {})
    cols = [c["name"] for c in result.get("cols", [])]
    rows = result.get("rows", [])
    print("COLS:", cols, "| ROWS:", len(rows))
    for row in rows:
        vals = [x.get("value") for x in row]
        print(dict(zip(cols, vals)))
