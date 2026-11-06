#!/bin/bash
# End-to-end diagnostic: register diag user, login, trigger LLM ai-analysis on production NIPH
BASE="https://egx-scanner-ashy.vercel.app"
TS=$(date +%s)
EMAIL="diag${TS}@egx-diag.local"
PASS="Diag${TS}pass!"

echo "== 1. register =="
curl -s --max-time 20 -X POST "$BASE/api/v1/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"name\":\"Diagnostic\"}" | head -c 300
echo; echo "== 2. login =="
LOGIN=$(curl -s --max-time 20 -X POST "$BASE/api/v1/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
TOKEN=$(echo "$LOGIN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).token||'')}catch(e){console.log('')}})")
echo "token: ${TOKEN:0:24}..."
echo "== 3. find NIPH company id =="
COMP=$(curl -s --max-time 20 "$BASE/api/v1/companies?search=NIPH&pageSize=3")
CID=$(echo "$COMP" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);const c=(j.companies||j.data||j.items||[])[0];console.log(c?c.id:'')}catch(e){console.log('')}})")
echo "companyId: $CID"
echo "== 4. POST ai-analysis (ar) =="
curl -s --max-time 120 -X POST "$BASE/api/v1/companies/$CID/ai-analysis" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"lang":"ar"}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);if(j.error){console.log('ERROR:',j.error,j.message||'')}else{const a=j.analysis||{};console.log('degraded:',a.degraded,'| model:',a.model,'| cached:',j.cached);console.log('content head:',(a.content||'').slice(0,220).replace(/\n/g,' '))}}catch(e){console.log('RAW:',d.slice(0,400))}})"
