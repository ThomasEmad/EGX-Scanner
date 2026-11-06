#!/bin/bash
# Idempotent watchdog: restore project from tarball if needed, ensure deps+build, restart server
cd /tmp/my-project 2>/dev/null || {
  # Disaster recovery: project dir vanished (sandbox recycle). Restore source
  # from the newest tarball in the persistent zone, then let the steps below
  # reinstall deps and rebuild.
  TARBALL=$(ls -t /home/z/my-project/download/backup/egx-src-*.tar.gz 2>/dev/null | head -1)
  [ -n "$TARBALL" ] || { echo "$(date -Iseconds) FATAL: project missing and no tarball" >> /home/z/my-project/scripts/keep-alive.log; exit 1; }
  mkdir -p /tmp/my-project
  tar -xzf "$TARBALL" -C /tmp/my-project
  echo "$(date -Iseconds) project restored from $(basename "$TARBALL")" >> /home/z/my-project/scripts/keep-alive.log
}
DB_DIR=/home/z/my-project/download/db
DB=$DB_DIR/custom.db
LOG=/home/z/my-project/scripts/keep-alive.log
CANON_ENV=/home/z/my-project/download/config/env.production
mkdir -p "$DB_DIR" reports

# --- env integrity: sandbox restores can truncate .env; always sync from the durable copy ---
if [ -s "$CANON_ENV" ]; then
  if ! rg -q "^ADMIN_PASSCODE=" .env 2>/dev/null || [ "$(wc -l < .env)" -lt 10 ]; then
    cp "$CANON_ENV" .env
    echo "$(date -Iseconds) env restored from canonical" >> "$LOG"
  fi
fi
# The sandbox shell exports a STALE DATABASE_URL (/home/z/my-project/db/...,
# no such dir). Real env vars beat .env files in Next, so both `bun run build`
# (prerender hits the DB) and the server must get the correct value explicitly.
export DATABASE_URL="file:/home/z/my-project/download/db/custom.db?busy_timeout=10000&connection_limit=10"
[ -f "$DB" ] || [ -f db/custom.db ] || { echo "$(date -Iseconds) FATAL: no DB" >> "$LOG"; exit 1; }
[ -f "$DB" ] && [ ! -f db/custom.db ] && cp "$DB" db/custom.db
[ -f "$DB" ] && cp db/custom.db "$DB"
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/v1/status --max-time 6)
if [ "$HEALTH" = "200" ]; then echo "$(date -Iseconds) healthy" >> "$LOG"; exit 0; fi
[ -d node_modules ] || bun install >> "$LOG" 2>&1
[ -d node_modules/.prisma ] || [ -d node_modules/@prisma/client ] || bunx prisma generate >> "$LOG" 2>&1
if [ ! -f .next/standalone/server.js ]; then
  echo "$(date -Iseconds) rebuilding standalone..." >> "$LOG"
  NODE_OPTIONS="--max-old-space-size=2048" bun run build >> "$LOG" 2>&1
fi
[ -f .next/standalone/server.js ] && cp -r public .next/standalone/ 2>/dev/null
HOSTNAME=0.0.0.0 PORT=3000 nohup node scripts/start-standalone.mjs > reports/server.log 2>&1 &
# also keep the standalone-copy env in sync (build artifacts may be restored stale)
[ -s "$CANON_ENV" ] && cp "$CANON_ENV" .next/standalone/.env 2>/dev/null
echo "$(date -Iseconds) restarted (was $HEALTH)" >> "$LOG"
