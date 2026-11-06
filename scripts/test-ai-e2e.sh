#!/bin/bash
# E2E test: new diagnostic user -> login -> run AI analysis on production (NVIDIA GLM)
# usage: test-ai-e2e.sh [company_id]   (default: first company)
BASE="https://egx-scanner-ashy.vercel.app"
TS=$(date +%s)
EMAIL="diag.glm531.${TS}@diag-test.local"
PASS="DiagTest#2026x"

TOKEN="$2"
if [ -z "$TOKEN" ]; then
  echo "=== 1) Register $EMAIL ==="
  REG=$(curl -sS -m 30 -X POST "$BASE/api/v1/auth/register" -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"name\":\"Diag GLM531\"}")
  TOKEN=$(echo "$REG" | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
fi
if [ -z "$TOKEN" ]; then echo "NO TOKEN"; exit 1; fi
echo "token ok (${#TOKEN} chars)"

CID="$1"
echo "company id: $CID"
[ -z "$CID" ] && { echo "USAGE: $0 <company_id>"; exit 1; }

echo "=== 3) POST ai-analysis (lang=ar) — may take up to ~100s ==="
START=$(date +%s)
RESP=$(curl -sS -m 170 -X POST "$BASE/api/v1/companies/$CID/ai-analysis?lang=ar" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}' \
  -w "\n__HTTP__%{http_code}")
END=$(date +%s)
BODY=$(echo "$RESP" | sed 's/__HTTP__[0-9]*$//')
CODE=$(echo "$RESP" | grep -o '__HTTP__[0-9]*$' | grep -o '[0-9]*$')
echo "elapsed: $((END-START))s http=$CODE"
echo "$BODY" | python3 -c "
import json,sys
raw=sys.stdin.read()
try: d=json.loads(raw)
except Exception:
    print('NON-JSON:',raw[:600]); raise SystemExit
a=d.get('analysis') or d.get('data') or d
if isinstance(a,dict):
    print('model:', a.get('model'))
    print('cached:', a.get('cached'), '| degraded:', a.get('degraded'), '| degradedReason:', a.get('degradedReason'))
    c=a.get('content') or ''
    print('content length:', len(c))
    print('--- first 500 chars ---')
    print(c[:500])
else:
    print(json.dumps(d)[:600])
"
echo "$BODY" > /tmp/ai_analysis_resp.json
echo "EMAIL=$EMAIL PASS=$PASS CID=$CID" > /tmp/diag_user.txt
