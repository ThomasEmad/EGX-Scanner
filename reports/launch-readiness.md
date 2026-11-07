# تقييم جاهزية الإطلاق — Meza / Production Readiness Assessment

**التاريخ / Date:** 2026-11-03  
**الإصدار / Version:** 0.3.0 (local, uncommitted)  
**البيئة / Environment:** Next.js 16.3.2 standalone, Node.js, Prisma + SQLite  
**المنهج / Method:** evidence-based; every number below was measured against the running build or the database. No claim is made unless it was verified.

---

## 1. الحكم النهائي / Final verdict

> **Not ready for a full commercial launch. Ready for a controlled private beta / soft launch** with manual onboarding, explicit “data as of” labels, and a published limitations page.

**الترجمة:** المنصة **غير جاهزة لإطلاق تجاري كامل**، لكنها **جاهزة لبيتا خاصة / إطلاق محدود** مع تسجيل يدوي، ووسم صريح لتاريخ البيانات، ونشر صفحة حدود الخدمة.

The engineering, SEO, security and **data-integrity** baseline is now solid. The remaining launch gaps are **coverage, freshness and operations**, not contradictory financial statements:

- **0 blocker-class audit issues** (0 critical, 0 high). The audit engine’s blocker class is empty.
- 42 findings still carry `severity: critical`, but **all 42 are `coverage`-class missing-metric findings** (mostly `REVENUE`/`NET_PROFIT` absent or quarantined), not contradictions. They are visible on `/data-quality` and are not hidden.
- 19,015 values remain quarantined (18.9% of 99,230), mostly annual-copy duplicates, mixed-company reports and unverifiable cash-flow statements.
- Market prices are a **15-minute-delayed TradingView snapshot** dated 2026-11-03, not a licensed real-time feed.
- 0 dividend records, no external uptime/error tracking, no online payment gateway. (Local backup and health-check scripts are now in place.)

A commercial launch with those gaps would still create a misleading signal, so the recommendation remains a controlled beta.

---

## 2. بطاقة الدرجات / Scorecard

| المحور / Area | الدرجة / Score | الحالة / Status | الأساس / Evidence |
|---|---:|---|---|
| هندسة التطبيق / Engineering | 9/10 | ✅ جاهز | `tsc` clean, ESLint clean, 81/81 tests, production build clean |
| SEO | 8/10 | ✅ جاهز | 303 sitemap URLs, ticker canonicals, sector SSR, JSON-LD, robots, noindex rules |
| الأمان الأساسي / Security baseline | 7/10 | ⚠️ جاهز بشرط | CSP/HSTS/X-Frame/nosniff, bcrypt, HttpOnly sessions, rate limits; single-instance limiter, no WAF/monitoring |
| واجهة المستخدم / UI/UX | 7/10 | ✅ جاهز | Bilingual AR/EN, responsive, skeletons, accessible skip link, no fake notifications |
| دقة البيانات / Data accuracy | 8/10 | ✅ جاهز (مع تحفظ) | **0 blocker-class issues**; 42 coverage-class critical findings; 19,015 quarantined values |
| اكتمال البيانات / Coverage | 6/10 | ⚠️ حاجز | 271/276 have annual data; ISIN 93.5%; shares 91.7%; 1 no-trusted company |
| حداثة البيانات / Freshness | 5/10 | ⚠️ حاجز | Prices 2026-11-03 (15-min delayed); 55 companies >365d; 0 dividend records |
| العمليات / Operations | 5/10 | ⚠️ جاهز بشرط | Backup + restore + healthcheck scripts added; external uptime/APM and CI/CD still missing |
| الامتثال القانوني / Legal | 5/10 | ⚠️ تحسّن | Disclaimer + Terms + Privacy present; data redistribution licences not verified |
| الجاهزية التجارية / Commercial | 4/10 | ❌ حاجز | Manual subscription activation, no online payment gateway, no SLA |

**الإجمالي المرجّح / Weighted:** ≈ **6.2 / 10** — beta-grade, improved data integrity, not commercial-grade.

---

## 3. ما تم التحقق منه فعلياً / What was actually verified

### 3.1 Build & tests
| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean |
| `npm test` | 10 files / 81 tests passed |
| `npm run build` | succeeded, Next 16.3.2, standalone output |
| Static pages generated | 74 (including `/privacy`) |
| Runtime smoke | pages and APIs 200 (see `reports/final-verification.txt`) |

### 3.2 Security headers (verified on `/`)
| Header | Value |
|---|---|
| `Content-Security-Policy` | present; no `unsafe-eval` in production; `upgrade-insecure-requests` only in production |
| `Strict-Transport-Security` | present |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | present |
| `Permissions-Policy` | present |
| `X-Powered-By` | absent |
| `Cross-Origin-Opener-Policy` | present |

### 3.3 Data state (database, measured)
| Metric | Value |
|---|---:|
| Companies (total / active) | 297 / 276 |
| Trusted reports | 6,803 |
| Companies with annual data | 271 / 276 |
| Values `VALID` | 80,215 |
| Values `NEEDS_REVIEW` (quarantined) | 19,015 |
| Calculated metrics | 270,783 |
| Financial events | 4,235 |
| Dividend records | 0 |
| Market price rows | 12,154 |
| Companies with ISIN | 93.5% |
| Companies with shares outstanding | 91.7% |
| Companies with a price snapshot | 260 / 276 |
| Companies with a price older than 7 days | 1 |
| Companies with no price | 16 |
| Freshest price | 2026-11-03 (15-minute-delayed snapshot) |
| Latest audit run | `cmw0ynprx0000bxs4jc3tp4im` |
| Audit findings | 1,974 total: **42 critical / 292 high / 691 medium / 949 low** |
| By class | **blocker 0** / coverage 637 / advisory 1,318 / metadata 19 |

### 3.4 Specific data fixes verified
- **Blocker-class audit gate:** after the final remediation pass the audit reports **0 blocker-class critical and 0 blocker-class high** issues. The 42 `severity: critical` rows are all `issueClass: coverage` missing-metric findings.
- **Balance-sheet identities:** 10 values across 8 company-periods quarantined reversibly (ARVA FY2022/FY2023, GOCO FY2022, EHDR FY2024, IRON FY2013, NAHO FY2023, MAAL FY2021/FY2022). Rollback: `reports/balance-sheet-failures-rollback.json`.
- **PBT / tax / net profit:** 2 provable tax-sign fixes (EGTS FY2024, MMAT FY2025); 10 unreconcilable PBT/tax lines quarantined (AMER, BINV, FIRE, GIHD, OFH). Rollback: `reports/pbt-tax-failures-rollback.json`.
- **Asset / gross-profit / cash-flow identities:** EGAS current assets and cash scaled up 1e6× (identity then closes within 0.83%); NCEM gross-profit sign corrected; 14 outlier lines quarantined (SIPC FY2022 totals, FWRY/IRON gross profit, MPCO COGS, ARAB/MFPC cash-flow legs, MAAL FY2022 net change). Rollback: `reports/critical-identities-rollback.json`.
- **High-severity blockers:** ASCM liabilities, UEGC FY2021 balance-sheet block, VALU Q4 2024 derived block, and the AXPH EXCEL duplicate quarantined reversibly. Rollback: `reports/high-blockers-rollback.json`.
- **Cash-flow contradictions:** 83 values across 34 company-periods quarantined after comparing the three legs (+FX) with the opening/closing cash movement. When the legs reconciled, the net-change line was quarantined; when the net change reconciled, the legs were quarantined; when neither reconciled, the whole flow block was quarantined. Opening/closing cash was kept. Rollback: `reports/cashflow-outliers-rollback.json`.
- **Audit classification hardening:** `ASSET_COMPONENTS`, `DEBT_COMPONENTS` and corroborated-but-incomplete `CASH_FLOW_SUM` findings are now `coverage`/`high`, not `blocker`; a net change that **contradicts** opening/closing cash remains a blocker. A regression test covers both paths.
- **SIPC mixed-company report:** 24 contaminated values quarantined reversibly; ROE **−6.27%**, ROA **−3.93%**. Rollback: `reports/quarantine-mixed-SIPC-2025-rollback.json`.
- **VLMR:** 5 annual reports FY2021–FY2025 imported from Mubasher (USD thousands normalized); 135 calculated metrics; no longer a no-data company.
- **No-data companies:** ECCW, EFOOD, MESF, PSFL, RPCO, VODE deactivated reversibly with a public coverage note; KORA stays active with a “statements not yet published” note. Rollback: `reports/nodata-deactivation-rollback.json`.
- **Future periods:** 5 future reports / 25 values quarantined; 2 FY2026 Yahoo reports (EOSB, SUGR) quarantined. Rollback: `reports/future-period-quarantine.json`.
- **Fiscal periods:** 851 reversible corrections.
- **Aliases:** 14 duplicate tickers deactivated reversibly (not deleted).
- **Statement type:** 41,985 rows relabelled from consolidation basis to statement kind.

---

## 4. الحواجز المتبقية / Remaining blockers (P0)

| # | الحاجز / Blocker | الأثر / Impact | المطلوب / Required to clear |
|---|---|---|---|
| 1 | **42 coverage-class critical findings** | Missing `REVENUE`/`NET_PROFIT` for a minority of companies; ratios and trend pages show “—” | Re-extract from official filings or second source; never infer/zero-fill |
| 2 | **19,015 quarantined values** | Coverage gaps; 1 company with no trusted data (KORA) | Second-source recovery or official filings; never auto-promote |
| 3 | **No licensed real-time market feed** | Prices are a 15-minute-delayed snapshot dated 2026-11-03 | Licensed EGX feed or authorized provider with SLA; keep explicit timestamps |
| 4 | **0 dividend records** | Dividend page/calendar is empty | Import verified dividend history; otherwise remove the promise from marketing |
| 5 | **ECSC/EGCH unresolved** | Possible duplicate entity; H1 2026 values conflict (1.794B vs 1.190B) | Second source (official IR/filing); do not merge on inference |
| 6 | **External monitoring / alerting / error tracking** | An outage or data regression would not page anyone | Run `npm run healthcheck` from an external monitor (5-min), add Sentry/APM, document on-call |
| 7 | **Secrets must be set in the deployment environment** | Admin/cron fail closed if unset (safe, but unusable) | Set `ADMIN_PASSCODE`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL` in production; local `.env` is already populated |
| 8 | **Manual subscription activation only** | No online payment; refunds/support manual | Payment gateway (Paymob/Stripe) or explicitly position as invoice-based beta |
| 9 | **Premium endpoints untested anonymously** | Company events → 403, AI analysis → 401 | Test with a real premium account; document expected responses |

---

## 5. المخاطر العالية / High-priority risks (P1)

1. **5 active companies without annual data** — quarterly-only or no statements; rankings may exclude them.
2. **18 companies without ISIN** — identifier coverage is 93.5%, not 100%.
3. **~23 companies without shares outstanding** — market cap / per-share metrics unavailable.
4. **55 companies with data older than 365 days** — the staleness label is correct, but the product needs a fresher source for those names.
5. **284 review-only identity gaps** (248 cash-flow, 36 balance-sheet) — not quarantined because a positive gap can be legitimate (NCI, FX); they need a second source.
6. **305 single-value annual-copy coincidences** — kept as review-only to avoid false positives.
7. **Ambiguous AskBorsa mismatches** (EFIC, HELI, DAPH, ASPI, ATLC, MPRC, TAQA, HRHO, OFH, TMGH, DSCW, MCRO) — need Mubasher/Thndr/filings.
8. **ISIN 404s / name-review cases** — no corroborating second source for a small set.
9. **Single-instance in-memory rate limiter** — resets on restart and does not coordinate across replicas; `TRUSTED_PROXIES` is empty.
10. **Cold-start latency** — first company API call after boot can take several seconds while scan contexts warm; warm calls are 35–300 ms. Acceptable for beta, not for a paid SLA without pre-warming/CDN.

---

## 6. الأداء / Performance (measured on the standalone build)

| Endpoint / Page | Warm | Cold (first call after boot) |
|---|---:|---:|
| `/` | ~180 ms | — |
| `/sectors/Banks` | ~640 ms | — |
| `/company/COMI` | ~530 ms | — |
| `/rankings` | ~80 ms | — |
| `/api/v1/dashboard` | ~110–170 ms | ~2.2 s |
| `/api/v1/companies/COMI` | ~35 ms | ~6–8 s |
| `/api/v1/companies/COMI/financials` | ~110 ms | ~110 ms |
| `/api/v1/rankings?metric=roe` | ~260–305 ms | — |
| `/api/v1/undervalued` | ~1.0 s | ~1.0–1.8 s |
| `/api/v1/market/ticker` | ~115 ms | — |

**Assessment:** warm paths are acceptable for a beta. Cold start is the main risk; `instrumentation.ts` warms scanner contexts and dashboard cards at boot, but the first visitor during the warm-up window still pays. Add a readiness probe and a CDN/cache layer before a paid launch.

---

## 7. الخطة / Remediation plan

### 30 يوم / 30 days — private beta
- Recover the 42 coverage-class critical metrics from official filings or a second source; document each unresolved case.
- Import verified dividend history or remove dividend claims from the product copy.
- Resolve ECSC/EGCH with an official filing; otherwise keep both and mark unresolved.
- Run the backup + restore drill monthly; add external uptime monitoring and Sentry/APM.
- Set `ADMIN_PASSCODE`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`, and trusted proxy config in the deployment environment.
- Test premium endpoints with a real premium account.
- Keep the “Data limitations” section on `/data-quality` current.

### 60 يوم / 60 days — paid pilot
- Licensed/authorized market feed with a freshness SLA; replace the static snapshot.
- Resolve the ambiguous AskBorsa mismatches with a second source.
- Close the missing ISINs and share counts where a public source exists.
- Add per-company editorial summaries (sourced, reviewed) to reduce thin-page risk.
- Add Arabic `hreflang` and Search Console/Bing verification.
- Add a payment gateway or formal invoice workflow with receipts and refund policy.

### 90 يوم / 90 days — commercial launch
- Achieve: 0 blocker-class findings (already met), 0 unexplained coverage-critical findings, <5% quarantined values, 100% identifier coverage, <24h price freshness, 99.5% uptime.
- External penetration test and dependency audit.
- Documented incident response, data-retention, and vendor/data-licence register.
- Load test at expected peak; verify cold-start under a CDN.
- Legal review of Terms/Privacy/Disclaimer and data redistribution rights.

---

## 8. قائمة التوقيع / Sign-off checklist

| Gate | Status |
|---|---|
| Build reproducible from clean checkout | ✅ verified locally |
| TypeScript strict, no build-time errors | ✅ enforced in `next.config.ts` |
| Tests pass | ✅ 81/81 |
| Lint clean | ✅ |
| Security headers | ✅ verified |
| No fake/placeholder data in UI | ✅ verified (— fallbacks) |
| Bilingual AR/EN | ✅ |
| Privacy Policy | ✅ added |
| **Blocker-class audit findings = 0** | ✅ **0 critical / 0 high** |
| Backups / restore | ✅ scripts added (`npm run backup`, `npm run restore`); monthly drill required |
| External monitoring | ⚠️ `npm run healthcheck` ready; no external uptime/APM wired yet |
| Licensed live market feed | ❌ not implemented (15-min delayed snapshot) |
| Dividends | ❌ no records |
| Coverage-class critical findings = 0 | ❌ 42 |
| Admin/cron secrets set | ✅ local `.env` populated; set the same keys in deployment |
| Payment gateway | ❌ manual only |

---

## 9. الخلاصة / Bottom line

The platform is a credible, well-engineered **beta** with a materially stronger data layer than the previous assessment: **zero blocker-class audit findings**, every remediation reversible and recorded, honest “—” fallbacks, bilingual UI, clean SEO and security headers. It is **not** yet a commercial product: 42 coverage-class critical metrics are still missing, 19,015 values are quarantined, prices are 15-minute-delayed, dividends are absent, and there is no operational safety net. Launch it to a small, informed group first; do not market it as “audited” or “official”, and keep the “data as of” labels visible.

**الخلاصة:** المنصة بيتا موثوقة وهندسياً جيدة، وطبقة البيانات أصبحت خالية من التناقضات المصنّفة كحواجز (blockers)، لكنها ليست جاهزة تجارياً بعد. أطلقها لمجموعة صغيرة أولاً، ولا تسوّقها كبيانات «مُدققة 100%» أو «رسمية»، وأبقِ تواريخ البيانات ظاهرة.
