# Audit Phase 2 — UX & Architecture (2026-09-26)

Status legend: ✅ FIXED this phase · 📋 BACKLOG (documented, prioritized, not blocking)

---

## AUDIT REPORT — Information Architecture

**Issue #1: SPA with zero URL routing — no deep links, no back button, no shareable links**
- Severity: CRITICAL
- Current State: every view (dashboard/scanners/companies/company detail) is internal React state at `/`; a reload always lands on the dashboard; browser back exits the site; an investor cannot share or bookmark a company.
- Expected State: every screen addressable via URL; back/forward traverse history; reload restores the view.
- Root Cause: `src/app/page.tsx` held `view`/`selectedCompanyId` in `useState` with no URL sync.
- Solution: hash-based router (`#/companies`, `#/company/{id}`, `#/scanners`, …) — `parseHash()` on load, `hashchange` listener, `history.pushState` on navigation. Zero-rewrite fix preserving all existing components.
- Files: `src/app/page.tsx`
- Status: ✅ FIXED (verified: reload restores view, back() returns to list, hash updates on open)
- 📋 Backlog (long-term form): migrate to real App Router paths (`/companies/[ticker]`) for server-rendered pages + per-company SEO.

**Issue #2: no custom 404**
- Severity: MEDIUM — Next default error page for bad paths.
- Solution: `src/app/not-found.tsx` bilingual page with a back-to-dashboard CTA. Status: ✅ FIXED (verified: `/nonexistent-page-xyz` renders it).

## AUDIT REPORT — Error / Loading / Empty states

**Issue #3: API errors rendered as eternal skeletons**
- Severity: CRITICAL
- Current State: every data view used `if (isLoading || !data) return <Skeleton/>`; `react-query` errors left `data` undefined forever → investor sees infinite loading on any API failure.
- Expected State: explicit error card with a retry action, distinct from loading.
- Root Cause: error state never modeled.
- Solution: `ErrorState` component (AlertTriangle + retry via `refetch()`) wired into `isError` of the company query, statements, growth, peers.
- Files: `src/components/egx/company-detail.tsx`
- Status: ✅ FIXED (verified: `#/company/nonexistent-id-123` shows the retry card, not a skeleton)

## AUDIT REPORT — Security

**Issue #4: default admin passcode printed on the login screen**
- Severity: HIGH — "default: egx-admin" shown in the gate copy teaches any visitor the credential.
- Solution: removed from copy; replaced with a neutral restricted-area description.
- Files: `src/components/egx/reports-view.tsx` — Status: ✅ FIXED

**Issue #5: unthrottled public LLM endpoint**
- Severity: HIGH — `POST /companies/[id]/ai-analysis` is public (by spec) and spends LLM budget; no rate limit.
- Solution: in-memory per-IP limiter (10 generations / 10 min, 429 + Retry-After).
- Files: `src/app/api/v1/companies/[id]/ai-analysis/route.ts` — Status: ✅ FIXED
- 📋 Backlog: persist rate-limit buckets outside dev process; gate behind auth when user accounts ship.

**Issue #6 (pre-existing, known)**: admin sessions are in-memory (restart clears); no CSRF (token-header pattern mitigates); Prisma parameterizes all queries (SQLi safe); `localFileRef` never exposed (download route streams). Status: 📋 documented limitation, acceptable for current stage.

## AUDIT REPORT — Performance

**Issue #7: company-detail preset matching ran 3 full scans serially**
- Severity: HIGH — `buildScanContexts` builds contexts for ALL companies; the route awaited it three times (once per basis).
- Solution: `Promise.all` over the three bases.
- Files: `src/app/api/v1/companies/[id]/route.ts` — Status: ✅ FIXED
- 📋 Backlog: dashboard route has the same shape per scanner card; cache scan contexts with a short TTL.

## AUDIT REPORT — SEO & Meta

**Issue #8: stale metadata ("Demo data" in the description) + no OG/robots**
- Severity: MEDIUM — the meta description contradicted the verified-data reality.
- Solution: root metadata rewritten (title template, OG, robots), `app/robots.ts` added. Per-page meta awaits the real-routes migration (backlog above); JSON-LD per company same.
- Files: `src/app/layout.tsx`, `src/app/robots.ts` — Status: ✅ FIXED (baseline)

## AUDIT REPORT — Investor UX

**Issue #9: no data export**
- Severity: HIGH for real investors — statements locked in the DOM.
- Solution: client-side CSV export button on the statements toolbar (current statement kind + period view, BOM for Excel Arabic support).
- Files: `src/components/egx/company-detail.tsx` — Status: ✅ FIXED

**Issue #10: no company visual identity**
- Severity: LOW — text-only headers.
- Solution: ticker monogram avatar (gradient badge) beside the company title.
- Files: `src/components/egx/company-detail.tsx` — Status: ✅ FIXED (real logos need a licensed source — backlog)

**Issue #11: admin gate looked like an afterthought**
- Severity: MEDIUM — plain card, no error surface, credential hint.
- Solution: branded centered auth card (shield monogram, gradient accent, labeled password field with autocomplete, inline error alert, full-width unlock).
- Files: `src/components/egx/reports-view.tsx` — Status: ✅ FIXED

## VERIFIED-ALREADY-GOOD (audited, no action)

- Dark mode, EN/AR + RTL (verified again this phase), mobile chip navigation (390px verified), debounced bilingual search (Arabic company name finds the company), skeletons on loading, empty states (`NoFinancialsEmpty`), statement-kind tabs, sticky table headers + sticky first column, negative-value red coloring, source traceability per value, methodology + factual-tool disclaimers.
- Session persistence: tokens in localStorage survive reopen (verified across reloads).

## PRIORITIZED BACKLOG (not fixed, by design)

1. Real App Router routes + per-company SEO/JSON-LD (needs the SPA migration).
2. Social login + forgot-password + RBAC on top of the existing User/Session/Plan tables (`/login` page exists but is unwired from the header — wire when user features ship).
3. Search autocomplete dropdown + recent searches (server has the data; UI work only).
4. Fuzzy search / ticker aliases.
5. Dashboard scan-context caching + HTTP cache headers.
6. Company logos (licensed feed), price history chart on company page (data already in MarketPrice).
7. Offline mode (service worker), unit-test infrastructure (vitest) for the quality gate's test item.
8. CSRF hardening + persistent admin sessions when multi-user for real.
