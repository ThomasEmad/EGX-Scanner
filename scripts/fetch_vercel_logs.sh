#!/bin/bash
# Fetch recent runtime logs from Vercel and print only errors/warnings (sanitized)
TOKEN="$(cat /home/z/my-project/scripts/.vtoken 2>/dev/null)"
PROJ="prj_cY9krexWUlK0dAB2M0aXq3u2VXEG"
TEAM="team_rjjCm6Zg6Vndzbq4H3PQKIoM"
SINCE=$(( ($(date +%s) - 3600) * 1000 ))
UNTIL=$(date +%s)000
curl -s --max-time 30 -H "Authorization: Bearer $TOKEN" \
  "https://api.vercel.com/v3/monitoring/events?settingsId=$PROJ&teamId=$TEAM&from=$SINCE&to=$UNTIL&statuses=500&limit=100" \
  -o /tmp/vlogs.json
echo "bytes: $(wc -c < /tmp/vlogs.json)"
