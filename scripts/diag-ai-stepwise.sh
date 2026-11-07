#!/bin/bash
# Stepwise diagnostic: GET vs POST ai-analysis with full Vercel error headers
BASE="https://meza-ashy.vercel.app"
EMAIL="diag1793979269@egx-diag.local"
PASS="Diag1793979269pass!"
CID="cmui726f8004hbx90jyyuioyk"

TOKEN=$(curl -s --max-time 20 -X POST "$BASE/api/v1/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).token||'')}catch(e){console.log('')}})")
echo "TOKEN=${TOKEN:0:36}..."
echo "$TOKEN" > /tmp/diag-token.txt

echo "== GET ai-analysis (cached path) =="
curl -s -o /tmp/get-resp.json -w "HTTP=%{http_code} time=%{time_total}s\n" --max-time 100 \
  "$BASE/api/v1/companies/$CID/ai-analysis" -H "Authorization: Bearer $TOKEN" -D /tmp/get-headers.txt
rg -i "x-vercel|HTTP/" /tmp/get-headers.txt | head -6
head -c 200 /tmp/get-resp.json; echo

echo "== POST ai-analysis (generation path) =="
curl -s -o /tmp/post-resp.json -w "HTTP=%{http_code} time=%{time_total}s\n" --max-time 120 \
  -X POST "$BASE/api/v1/companies/$CID/ai-analysis" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"lang":"ar"}' -D /tmp/post-headers.txt
rg -i "x-vercel|HTTP/" /tmp/post-headers.txt | head -6
head -c 300 /tmp/post-resp.json; echo
