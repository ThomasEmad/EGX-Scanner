#!/bin/bash
# FINAL STREAMING verification: real LLM analysis on production
BASE="https://egx-scanner-ashy.vercel.app"
TS=$(date +%s)
EMAIL="diag6${TS}@egx-diag.local"
PASS="Diag${TS}pass!"
CID="cmui726f8004hbx90jyyuioyk"

sleep 6
echo "== register fresh user =="
TOKEN=$(curl -s --max-time 20 -X POST "$BASE/api/v1/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"name\":\"Diag6\"}" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).token||'')}catch(e){console.log('')}})")
echo "$TOKEN" > /tmp/diag-token6.txt

echo "== POST ai-analysis (ar) =="
curl -s -o /tmp/ai-final2.json -w "HTTP=%{http_code} time=%{time_total}s\n" --max-time 135 \
  -X POST "$BASE/api/v1/companies/$CID/ai-analysis" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"lang":"ar"}'
node -e "try{const j=require('/tmp/ai-final2.json');if(j.error){console.log('ERROR:',j.error,j.message||'')}else{const a=j.analysis||{};console.log('degraded:',a.degraded,'| model:',a.model,'| lang:',a.lang);console.log('content length:',(a.content||'').length);console.log('=== head ===');console.log((a.content||'').slice(0,650))}}catch(e){console.log('parse fail:',require('fs').readFileSync('/tmp/ai-final2.json','utf8').slice(0,150))}"
