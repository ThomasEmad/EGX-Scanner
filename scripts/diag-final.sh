#!/bin/bash
# FINAL verification: real LLM analysis on production with NVIDIA GLM
BASE="https://egx-scanner-ashy.vercel.app"
TS=$(date +%s)
EMAIL="diag3${TS}@egx-diag.local"
PASS="Diag${TS}pass!"
CID="cmui726f8004hbx90jyyuioyk"

sleep 8
echo "== health =="
curl -s --max-time 15 "$BASE/api/v1/health" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('ok:',j.ok,'| db:',j.database,'| companies:',j.companies)})"

echo "== register fresh diag user =="
TOKEN=$(curl -s --max-time 20 -X POST "$BASE/api/v1/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"name\":\"Diag3\"}" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).token||'')}catch(e){console.log('')}})")
echo "token: ${TOKEN:0:16}..."

echo "== POST ai-analysis (ar) — the real test =="
curl -s -o /tmp/ai-final.json -w "HTTP=%{http_code} time=%{time_total}s\n" --max-time 130 \
  -X POST "$BASE/api/v1/companies/$CID/ai-analysis" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"lang":"ar"}'
node -e "try{const j=require('/tmp/ai-final.json');if(j.error){console.log('ERROR:',j.error,j.message||'')}else{const a=j.analysis||{};console.log('degraded:',a.degraded,'| model:',a.model,'| lang:',a.lang);console.log('=== content head ===');console.log((a.content||'').slice(0,700))}}catch(e){console.log('parse fail:',require('fs').readFileSync('/tmp/ai-final.json','utf8').slice(0,200))}"
