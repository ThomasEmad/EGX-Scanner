# Meza — Production Runbook
Last verified: 2026-11-06 (all commands below tested on the live deployment)

## 1. Start / Restart (the ONLY correct way)

The sandbox exports a **stale `DATABASE_URL` in the shell environment** which silently
overrides `.env` and breaks every API (Prisma error 14). Always launch with an explicit
override — `scripts/keep-alive.sh` already does this:

```bash
bash /home/z/my-project/scripts/keep-alive.sh          # idempotent: healthy → no-op
# manual equivalent:
cd /tmp/my-project && \
DATABASE_URL="file:/home/z/my-project/download/db/custom.db?connection_limit=8&busy_timeout=15000" \
HOSTNAME=0.0.0.0 PORT=3000 nohup node scripts/start-standalone.mjs > reports/server.log 2>&1 &
```

Never run a bare `nohup bun run start &` from a tool shell — it dies when the shell exits.

## 2. Build

```bash
cd /tmp/my-project && bun run typecheck && bun run test && \
DATABASE_URL="file:/home/z/my-project/download/db/custom.db?connection_limit=8&busy_timeout=15000" \
NODE_OPTIONS="--max-old-space-size=2048" bun run build   # 2.4–5 min; then keep-alive restarts
```

`DATABASE_URL` MUST be passed to the build too — the `/sectors` prerender queries the DB.
`next.config.ts` sets `ignoreBuildErrors: true` (tsc OOMs in-sandbox); typecheck runs separately.

## 3. Environment (see `.env.example` for the full annotated list)

| Var | Purpose | Status |
|---|---|---|
| `DATABASE_URL` | SQLite + `?connection_limit=8&busy_timeout=15000` | ✅ set (pool-tuned for 10k users) |
| `ADMIN_PASSCODE` | /admin passcode | ✅ set |
| `CRON_SECRET` | guards /api/v1/cron/* | ✅ set |
| `GOOGLE_CLIENT_ID/SECRET` | Google OAuth | ⬜ **needs user** |
| `FACEBOOK_CLIENT_ID/SECRET` | Facebook OAuth | ⬜ **needs user** |
| `OAUTH_STATE_SECRET` | OAuth CSRF HMAC (falls back to CRON_SECRET) | auto |
| `RESEND_API_KEY`/`SMTP_*` | password-reset email delivery | ⬜ **needs user** (tokens stored but never emailed) |
| `NEXT_PUBLIC_SITE_URL` | sitemap/OG canonical | ⬜ **needs real domain** |

## 4. Data safety

- Live DB: `/tmp/my-project/db/custom.db` (WAL mode, page_size 4K).
- Durable copy: `/home/z/my-project/download/db/custom.db` — refreshed by keep-alive
  **every 5 minutes** (only when healthy, so you never back up a mid-write file).
- The cron job (ID 508700) runs keep-alive every 5 min and self-heals: restores env,
  reinstalls deps, rebuilds standalone, restarts the server.
- The sandbox wipes `/home/z` outside `download/|upload/|scripts/` on recycle — code in
  `/tmp/my-project` is rebuildable from the source + tarball if lost; the DB in
  `download/db/` is the irreplaceable asset.

## 5. Health & monitoring

- `GET /api/v1/status` → `{"status":"ok", ...}` (watchdog uses this)
- `GET /api/v1/metrics` → 200
- Log: `/tmp/my-project/reports/server.log`; watchdog log: `scripts/keep-alive.log`

## 6. Verified working (2026-11-06)

- All 14 pages + hot APIs 200; cold sectors 2.3s → warm 15–60ms (stale-while-revalidate)
- 103/103 unit tests green; `tsc --noEmit` clean
- OAuth: code complete (start/callback/providers routes + OAuthButtons UI), providers
  hidden until credentials set — live probe: `{"google":false,"facebook":false}`
- Quick AI: end-to-end PASS (register → POST ai-analysis → grounded GLM analysis, cached)
- Security: CSP/HSTS/XFO/Permissions-Policy headers, timing-safe admin passcode,
  hashed session tokens, rate limiting, secret-gated cron routes, admin-gated ops
- PWA: manifest (ar-EG/RTL) + service worker + offline page; bilingual error boundaries

## 7. Known limits (honest list)

- Single node. SQLite survives 10k users only with the pool tuning above + read-heavy
  load; >50 concurrent writers → migrate to PostgreSQL (schema is portable via prisma).
- In-memory rate limiter = per-process only (fine for one node, not for a cluster).
- Email delivery and real payment gateway are code-ready stubs pending provider accounts.
