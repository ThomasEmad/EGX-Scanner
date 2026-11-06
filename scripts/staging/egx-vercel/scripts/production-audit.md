# Production Readiness — Work Tracker
Started: 2026-11-06. COMPLETED same day. Tracker kept for audit trail.

## Goal
"جهز الموقع كله للـ production كأنه موقعك، واللي مستحيل تعمله قولي عليه"

## Checklist — ALL DONE
- [x] 1. Audit: code/config scan, all nav links, admin/cron/payment security gates, TODO leftovers
- [x] 2. DB hardening: WAL verified + Prisma pool params (connection_limit=8&busy_timeout=15000, tested live) + backup every 5 min via watchdog + canonical-env protection in keep-alive.sh
- [x] 3. Security: CSP/HSTS/XFO verified present; admin timing-safe passcode + hashed sessions; cron secret-gated; no ungated ops endpoints (admin/login exempt by design)
- [x] 4. /companies quick-analysis button: was ALREADY built (Nov 4) + in live build; VERIFIED visually (⚡ Quick AI on every card) + end-to-end API test PASS
- [x] 5. Performance: cold vs warm caching verified (sectors 2.3s cold → 15-60ms warm, stale-while-revalidate); pool tuning applied
- [x] 6. SEO/PWA: sitemap.xml 200, robots, manifest ar-EG RTL, sw.js, og-image, bilingual error boundaries — all verified
- [x] 7. Final build (exit 0 with explicit DATABASE_URL) + restart + visual check desktop+mobile + end-to-end AI test + runbook (download/PRODUCTION_RUNBOOK.md)
- [x] 8. Final report: below

## Fixes made this run
1. Sidebar.tsx (dead-but-shipped component): fixed /notifications 404 → /alerts, /saved-filters 404 → /dashboard#/scanners, fake badge:3 + dead TODO code → real live badges (watchlist store + /api/v1/alerts count). Note: live nav = AppSidebar.tsx which was already clean.
2. keep-alive.sh: DATABASE_URL override + /api/v1/status healthcheck + (cron agent later added canonical-env restore).
3. .env + keep-alive.sh: SQLite pool params appended to DATABASE_URL.
4. .env.example: documented OAuth/vars/pool/email placeholders sections.
5. Recovered DB to persistent zone after sandbox wipe; diagnosed + fixed env-pollution API-500 incident.
6. Cleanup: QA test user removed after e2e check.

## Environment Facts (do not re-derive)
- Code: /tmp/my-project; Live DB: /tmp/my-project/db/custom.db (569MB, WAL); durable copy download/db/custom.db (refreshed every 5 min)
- ALWAYS pass DATABASE_URL explicitly to: server start, build, any direct bun/prisma script (shell env is polluted with a stale path)
- Build: `DATABASE_URL=... NODE_OPTIONS="--max-old-space-size=2048" bun run build`; start via keep-alive.sh or scripts/start-standalone.mjs with env override
- Cron job 508700 keep-alive every 5 min
- OAuth code complete & built; providers hidden until GOOGLE_/FACEBOOK_ creds set
- RESEND_API_KEY empty → password-reset emails stored, never delivered
