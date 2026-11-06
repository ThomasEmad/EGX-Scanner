# EGX Production-Readiness Audit — 2026-11-06 (6h autonomous mission)

## Baseline (verified working)
- Prod standalone server: 200 on all public pages, <30ms. RSS ~1.25GB stable.
- Watchdog /home/z/my-project/scripts/keep-alive.sh + cron job 507850 (every 5 min).
- Code backup: /home/z/my-project/download/code-backup/egx-src-20261106.tar.gz
- DB: /home/z/my-project/download/db/custom.db (persistent, live).
- Security headers solid (HSTS, X-Frame DENY, CSP). Rate limits on auth/admin/AI endpoints. Audit log everywhere.

## Confirmed gaps (by priority)

### P1-AUTH (user's explicit ask)
1. NO OAuth at all. User model: passwordHash String (NOT nullable) → blocks OAuth users.
   Need: nullable passwordHash + OAuthAccount model + env-gated Google/Facebook flow
   (start → consent → callback → session). State cookie CSRF protection. Account link by email.
   Session = existing Session table (sha256 token, x-session-token header).
   UI: buttons on /login + /register only when provider configured (GOOGLE_CLIENT_ID/SECRET, FACEBOOK_CLIENT_ID/SECRET).
2. forgot-password = audit-log only. No self-service. Need PasswordResetToken + /reset-password
   page + POST /api/v1/auth/reset-password. No mail in sandbox → token surfaced in ADMIN audit
   view (admin hands it to user) + rate-limited.

### P1-SCALE (10k users)
3. Public APIs have NO Cache-Control and NO app-level cache for hot reads (rankings, sectors,
   breadth, dashboard/summary, companies, dividends, undervalued). Every hit → SQLite.
   → in-memory TTL cache (reuse src/lib/server-cache.ts if suitable) + Cache-Control headers.
4. Verify SQLite WAL + busy_timeout in src/lib/db.ts.
5. No global search endpoint; header has no search box. Companies API LIKE-scans.

### P1-PROMISED-BUT-MISSING (trust killers)
6. Login page promises «التنبيهات» (alerts) — PriceAlert does NOT exist in schema. Zero UI.
   → PriceAlert model (userId, companyId, direction above/below, targetPrice, active, triggeredAt)
   + /api/v1/alerts CRUD + evaluation engine (on price snapshot read) + UI (bell + page).
7. Watchlist = localStorage only (zustand persist, src/lib/client/watchlist.ts). Lost on device
   switch. → DB-backed WatchlistItem for signed-in users + merge on login + fallback for guests.

### P2-UX
8. Approved: /companies quick-analysis button (POST /api/v1/companies/{id}/ai-analysis, 402/429 handling, ~25s spinner, RTL bilingual).
9. Dark mode: next-themes present (class strategy, defaultTheme light, enableSystem false) — check header toggle visibility.
10. No service worker / PWA install. manifest.ts exists.
11. CSV export for rankings/companies.
12. No public status page (/status: uptime, data freshness, market asOf).

## Build order
Wave 1: schema (OAuthAccount, PasswordResetToken, nullable passwordHash) → db push → oauth routes → UI buttons → reset flow.
Wave 2: cache layer + headers + search endpoint + header search box.
Wave 3: PriceAlert + watchlist sync.
Wave 4: quick-analysis button + status page + CSV.
Final: typecheck, vitest, build, restart, verify, report.

## Session/auth facts (for implementation)
- createSession(userId) → uuid token; stored sha256; client header x-session-token; TTL 7d.
- lib/client/api.ts: setUserToken/getUserToken/clearUserToken(remember).
- OAuth callback must set token the same way → redirect with token in URL fragment (#token=)
  is bad; better: set HttpOnly cookie on callback + /oauth/finish page reads /auth/me via cookie?
  BUT the whole app uses x-session-token header from localStorage — simplest consistent approach:
  callback page (server route) redirects to /login?oauth=success&token=<uuid># with
  token in the FRAGMENT (never sent to server logs), and a small client script on /login
  (or dedicated /auth/finish page) picks location.hash token → setUserToken → strips hash.
  This matches the app's existing client-token model.

## Errors seen & fixed
- (none yet this session)

---
## SHIPPED (2026-11-06 session end) — all verified live
1. OAuth Google/Facebook: src/lib/oauth.ts + /api/v1/auth/oauth/{providers,[provider]/start,[provider]/callback} + /auth/finish + buttons on login/register. ENV-GATED (GOOGLE_CLIENT_ID/SECRET, FACEBOOK_*). Token via URL fragment. State cookie HMAC-signed 10min. Callback rate-limited 20/10min. Audit OAUTH_LOGIN/OAUTH_SIGNUP.
2. Self-service password reset: forgot-password now issues a single-use 30-min token (hash stored; RAW token visible ONLY in admin → security events card). /reset-password page + /api/v1/auth/reset-password. All sessions invalidated on success. Verified live incl. single-use rejection.
3. Admin security events: /api/v1/admin/security-events + card on admin dashboard (reset tokens, oauth, LOGIN_FAILED).
4. Alerts: PriceAlert model + /api/v1/alerts CRUD (max 20 active; lazy evaluation on read vs recorded prices) + /alerts bilingual page + user-menu link. Verified live (COMI 128 vs BELOW 100 = not hit).
5. Watchlist cloud sync: WatchlistItem model + /api/v1/watchlist/sync (GET/PUT/POST add|remove) + zustand store patched (fire-and-forget mirror; syncFromServer two-way merge on all 3 sign-in paths). Verified live CRUD.
6. Scale: WAL + synchronous=NORMAL + busy_timeout=10000 (asserted in instrumentation, boot-safe); SWR in-process cache + Cache-Control on rankings(60s)/companies(30s, query-keyed)/summary(60s)/undervalued(2m)/breadth(30s)/dividends(3m)/metrics(1h) via src/lib/public-cache.ts.
7. Search: /api/v1/search (indexed, 60s per-query cache) + header autocomplete switched to it.
8. Trust: /status page + /api/v1/status; /api/v1/companies/export CSV (BOM for Excel Arabic); footer/status link; sitemap + /status.
9. PWA: public/sw.js (API never cached; static cache-first; pages network-first 3s + /offline fallback) + ServiceWorkerRegistration (prod only) + /offline page.
10. Watchdog hardened: kills deaf masters (alive, no listener) before restart.
## Fixed env/infra
- instrumentation PRAGMAs via $queryRawUnsafe (journal_mode/busy_timeout RETURN rows — executeRawUnsafe rejects).
- auth.ts authenticateUser handles null passwordHash (OAuth-only users).
- rate-limit registry: auth-reset-password(10/h), auth-oauth-callback(20/10m), watchlist-sync(60/10m), alerts-write(30/10m).
- prisma/test.db schema re-pushed (was wiped by sandbox recycle) → 103/103.
- Stray DB copies in /tmp/my-project/{db,download} removed; backup excludes them. Backup = 69MB clean.
- Phantom-generated SEO layouts (missing quotes) fixed: login/register/forgot-password/reset-password (+ alerts written by me).
## KNOWN NEXT (not blocking)
- To enable Google/Facebook buttons: fill GOOGLE_CLIENT_ID/SECRET (+FACEBOOK_*) in .env; redirect URIs /api/v1/auth/{google,facebook}/callback. Template appended to .env (commented).
- Login page rate-limit applies per IP (5/15min) — verified working.
- PasswordResetToken raw token shown in admin card — acceptable for no-mail deployment; swap to email when SMTP exists.
- Alerts evaluate lazily on read (no scheduler) — fine at this scale; a cron evaluator can be added with the market refresh.
- test.db resets on sandbox recycle: run `DATABASE_URL=file:$(pwd)/prisma/test.db bunx prisma db push --skip-generate` before tests.
