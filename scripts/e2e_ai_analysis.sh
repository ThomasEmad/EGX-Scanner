#!/bin/bash
# E2E: register fresh user -> pick a company -> run AI analysis -> print result
BASE="https://egx-scanner-ashy.vercel.app"
JAR="/tmp/e2e_cookies.txt"
EMAIL="aitest$(date +%s)@example.com"
PASS="AiTest#2026x"

echo "== 1. register $EMAIL"
code=$(curl -sS --max-time 30 -c "$JAR" -o /tmp/reg.json -w "%{http_code}" -X POST "$BASE/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"name\":\"AI Chain Tester\"}")
echo "register HTTP $code $(head -c 150 /tmp/reg.json)"

echo "== 2. list companies (first page)"
code=$(curl -sS --max-time 30 -b "$JAR" -o /tmp/comps.json -w "%{http_code}" "$BASE/api/v1/companies?limit=5")
echo "companies HTTP $code"
COMPANY_ID=$(python3 -c "
import json
d = json.load(open('/tmp/comps.json'))
items = d.get('companies') or d.get('data') or d.get('items') or []
if items: print(items[0].get('id',''))
")
echo "company id: $COMPANY_ID"
[ -z "$COMPANY_ID" ] && { echo "NO COMPANY — dump:"; head -c 400 /tmp/comps.json; exit 1; }

echo "== 3. run AI analysis (this hits the NVIDIA chain; up to ~120s)"
START=$(date +%s)
code=$(curl -sS --max-time 150 -b "$JAR" -o /tmp/analysis.json -w "%{http_code}" -X POST \
  "$BASE/api/v1/companies/$COMPANY_ID/ai-analysis" -H "Content-Type: application/json" -d '{}')
END=$(date +%s)
echo "analysis HTTP $code in $((END-START))s"
python3 -c "
import json
d = json.load(open('/tmp/analysis.json'))
def brief(o, depth=0):
    if isinstance(o, dict):
        return {k: brief(v, depth+1) for k, v in o.items()}
    if isinstance(o, str):
        return o[:180] + ('...' if len(o) > 180 else '')
    return o
print(json.dumps(brief(d), ensure_ascii=False, indent=1)[:1500])
"
echo "cookie jar saved at $JAR; email: $EMAIL"
