# EGX Financial Scanner — Windows workspace

Next.js 16 + TypeScript + Prisma/SQLite financial-intelligence platform for Egyptian
Exchange (EGX) companies. Bilingual (EN/AR + RTL). Zero invented data: every figure
carries source traceability, and missing data renders as "—" — never zero, never
estimated.

## Run (Windows)

```bash
npm install          # once
npm run db:generate  # prisma generate (once, after install)
npm run dev          # http://localhost:3000
```

`.env` (see `.env.example`):

```
DATABASE_URL=file:./prisma/dev.db   # relative to prisma/schema.prisma → prisma/prisma/dev.db
ADMIN_PASSCODE=egx-admin
```

Admin UI: "Reports & Review" → passcode login. Admin token is held in
`localStorage["egx-admin-token"]`.

## Data

The database ships with **real EGX financials** imported from the `egx-data`
pipeline (Yahoo Finance API + Reuters financials pages — see
`../egx-data/`):

- 103 companies (96-company universe + 7 app-seeded), 399 report periods,
  ~15.2k validated values, 3.2k monthly price points, 674 detected events,
  10.4k calculated metrics across 54 companies with data.
- 41 of the 103 have no Yahoo/Reuters coverage (empty states are honest).
- Reports uploaded through the admin UI (e.g. the CIB PDFs) always take
  precedence over pipeline imports for the same period.

Recompute (calc engine + event engine) after any bulk data change:

```bash
TOKEN=$(curl -s -X POST localhost:3000/api/v1/admin/login -H 'Content-Type: application/json' -d '{"passcode":"egx-admin"}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).token))")
curl -X POST localhost:3000/api/v1/admin/recompute-all -H "x-admin-token: $TOKEN"
```

## Import pipeline (`scripts/import-egx-data.cjs`)

Re-runnable/idempotent; markers: reports with `parserVersion = "egx-data-import@1"`,
prices with `sourceName = "YAHOO_FINANCE_API"`.

```bash
node --env-file=.env scripts/import-egx-data.cjs
```

What it does: upserts the 96-company universe (canonical tickers — six
alias tickers like MFPC map onto existing ones, e.g. MOPCO), fills
`sharesOutstanding` from market snapshots, creates missing
`MetricDefinition`s, one APPROVED `FinancialReport` per (company, period)
with `extractionMethod="API_IMPORT"`, writes a `BALANCE_SHEET_IDENTITY`
validation row per report, imports monthly closes into `MarketPrice`, and
skips any period that already has a report (uploads win).

Known data caveats (handled, documented):

- Reuters-only rows arrive in millions → rescaled ×1e6 on import (per-share
  and ratio codes stay natural).
- June-FY companies (ABUK, ALCN, AMOC, EAST, EGAL) ship both fiscal and
  calendar-basis rows under the same labels; only rows matching the company's
  fiscal fingerprint (FY+0, Q1+3, H1+6, 9M+9 months) are imported.
- Yahoo sometimes fills "Total Liabilities" with "total liabilities AND
  equity"; the identity check passes those with an explanatory note.
- ~74 report periods fail the 2% balance identity on genuinely inconsistent
  source rows (worst: CCAP) — visible in the admin Validation Results tab.
- `dividend_yield` stays DATA_UNAVAILABLE (no announcement dates in the
  dataset — never fabricated).

## Tests

```bash
npx tsc --noEmit     # pre-existing errors live in examples/ + skills/ only
npx eslint <file>    # changed files
node scripts/test-financial-intelligence-engine.ts   # engine regression suite (bun-era script)
```

## Data quality & investor-UX guardrails

- **Strict sector peers**: `GET /companies/[id]/peers` compares only same-sector
  LISTED companies on the company's own latest annual period; sectors with <3
  listed companies return `insufficient: true` (UI shows a message instead of a
  meaningless cross-sector table). Banks compare on ROE/ROA/margin/BVPS/P-B.
- **Period views**: `?period_view=annual|interim` on `/financials` and `/metrics`
  — annual (FY only) and interim (Q1/H1/9M) are never mixed; chronological
  ordering; UI toggle with Annual as default.
- **Anomaly flags**: the financials response flags cells with >50% YoY changes,
  impossible signs (negative assets/revenue), zero revenue, and cells sourced
  from reports that failed the balance identity — rendered as ⚠ badges with an
  amber summary banner.
- **Statements display modes**: absolute EGP or common-size % (income/cash-flow
  as % of revenue, balance sheet as % of total assets), plus a per-row trend
  sparkline.
- **Freshness**: company detail returns `dataAsOf` (latest trusted filing
  period-end), shown in the header with a ⚠ after 15 months.
- **Continuous audit**: `node --env-file=.env scripts/audit-data-quality.cjs`
  (exit code 1 on failure) checks placeholder/duplicate ISINs, never-listed
  entities, canonical sector corrections, identity-failure rate, and stale data.

Canonical universe corrections enforced by the import (verified vs EGX listings,
2026-09-26): FWRY→Financial Services, EFID→Food, RREI→Real Estate,
NREH→Banks (state real-estate financing bank), EGAS renamed to Egypt Gas
(Natural Gas & Mining Project — the listed utility, not the unlisted state
holding); EGPC (state entity, never listed) is excluded entirely.

## Known limitations

- 42 universe companies have no Yahoo/Reuters coverage — PDF ingestion from
  IR pages is the next data milestone (the upload→extract→approve pipeline is
  fully operational for that).
- Fiscal-year interim quarters for June-FY companies are dropped (calendar
  ambiguity); they keep full FY data.
- No corporate actions (splits/bonus) — price series and share counts come
  from Yahoo as-is.
- 59 companies have a null ISIN (the universe's ISINs are mostly placeholders;
  null beats wrong — verify against EGX's official list before relying on them).
