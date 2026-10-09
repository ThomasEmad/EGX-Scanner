/**
 * import-egx-data.cjs — import the egx-data pipeline dataset (Yahoo Finance +
 * Reuters) into the EGX-Scanner SQLite database.
 *
 * Source:   ../../egx-data/data/{universe.json, financials-unified.json}
 * Idempotent: re-running deletes previously imported rows (parserVersion /
 *   MarketPrice sourceName markers) and re-imports. Never touches rows created
 *   by other pipelines (admin uploads, CIB PDFs, seeds).
 *
 * Data model decisions (documented, deliberate):
 *   - All monetary values that went through the Yahoo merge are already plain
 *     EGP (verified: ABUK EBITDA 1.198e10, ETEL revenue 1.0667e11). Reuters-ONLY
 *     records keep Reuters' display unit = MILLIONS and are rescaled ×1e6 here
 *     (per-share / ratio codes stay natural).
 *   - One FinancialReport per (company, period), processingStatus APPROVED,
 *     statementType CONSOLIDATED, extractionMethod "API_IMPORT",
 *     parserVersion "egx-data-import@1".
 *   - If ANY report already exists for the same
 *     (companyId, periodType, periodLabel, statementType) key, the import for
 *     that period is SKIPPED — official admin-uploaded filings always win.
 *   - Ticker aliases: some universe tickers are the same listed company as an
 *     existing DB ticker under a different spelling (MFPC/MOPCO …). Data
 *     imports onto the canonical DB ticker; alias companies are removed.
 *   - FY label collisions (June-FY companies get a true fiscal-FY set AND a
 *     calendar-year set from Yahoo under the same "FY {year}" label): the group
 *     whose period-end month matches the ticker's dominant FY month wins, the
 *     other is dropped with a warning.
 *   - market_data snapshots (P/E, P/B, market cap…) are NOT imported: the calc
 *     engine derives p_b/p_e/market_cap from MarketPrice + equity + shares.
 *     company.sharesOutstanding IS filled from the snapshot when missing.
 *   - Monthly close prices import into MarketPrice (engine market metrics).
 *   - No dividend rows: the dataset has no announcement dates; dividend_yield
 *     stays DATA_UNAVAILABLE (never fabricated).
 *   - A BALANCE_SHEET_IDENTITY FinancialValidationResult row (PASSED/FAILED)
 *     is written per imported report so identity issues in the source data are
 *     visible in the app instead of hidden.
 *
 * Run:  node --env-file=.env scripts/import-egx-data.cjs
 */

const fs = require("node:fs")
const path = require("node:path")
const { PrismaClient } = require("@prisma/client")

const db = new PrismaClient({ log: ["error", "warn"] })

const DATA_DIR = path.resolve(__dirname, "../../egx-data/data")
const PARSER_VERSION = "egx-data-import@1"
const EXTRACTION_METHOD = "API_IMPORT"
const PRICE_SOURCE = "YAHOO_FINANCE_API"

// Universe tickers that are the same listed company as an existing DB ticker
// under a different source spelling (verified by company name). Financial data
// imports onto the canonical DB ticker; the alias ticker is never created.
const ALIAS_TO_CANONICAL = {
  MFPC: "MOPCO", // Misr Fertilizers Production
  DSRB: "SUGR", // Delta Sugar
  EGCH: "ECSC", // Egyptian Chemical Industries (Kima)
  AUTO: "DOMTY", // Arabian Food Industries (Domty)
  CAQA: "CLHO", // Cleopatra Hospitals
  PREDCO: "PSFL", // Pioneers Holding → Pioneers Properties rename
}
const TICKER_RENAMES = {
  HOBE: "HDBK", // Housing & Development Bank — current ticker (user-verified)
  HHDG: "HELI", // Heliopolis Company for Housing — current ticker
  QNBA: "QNBE", // QNB Al Ahli — current ticker
}
const canonicalTicker = (t) => ALIAS_TO_CANONICAL[t] || TICKER_RENAMES[t] || t

// Canonical corrections applied over universe metadata (verified against EGX
// listings / web sources 2026-09-26). The universe builder misclassifies some
// sectors and carries a state holding's name on a listed subsidiary's ticker.
const NEVER_LISTED = new Set([
  "EGPC", "NILE", "BTEG", "ETAL",
  // user-verified non-existent / not-EGX-listed entities (2026-09-26)
  "BDCB", "NREH", "EKHO", "GTZO", "ELBA", "POCO", "UNAI", "TORA", "APPC", "EGWA",
  "NCGC", "WATP", "ACMR", "UCAP", "MDCI", "SINA", "LKGP", "ACFR", "ANCC", "EFAC",
  "HDST", "KNGC", "MLIC", "NMIN", "SIEG", "YAYT",
])
const CANONICAL_OVERRIDES = {
  FWRY: { sector: "Financial Services" }, // Fawry — fintech/payments, not Telecom
  EFID: { sector: "Food" }, // Edita Food Industries
  RREI: { sector: "Real Estate" }, // Roya Real Estate Investment
  NREH: { sector: "Banks" }, // National Real Estate Bank FOR DEVELOPMENT — state bank (verified: swfinstitute.org)
  EGAS: {
    nameEn: "Egypt Gas (Natural Gas & Mining Project)",
    nameAr: "إيجيبت جاز للغازات الطبيعية ومشاريع التعدين",
    sector: "Energy",
  },
  BTFH: {
    nameEn: "Beltone Financial Holding", // TradingView: "Beltone Holding" — confirmed
    nameAr: "بلتون القابضة للخدمات المالية",
    sector: "Financial Services",
  },
  ORWE: {
    nameEn: "Oriental Weavers (Carpet Industries)", // EGX listing verified
    nameAr: "الشرقية للسجاد والموكيت",
    sector: "Consumer",
  },
  SAIB: { nameAr: "الشركة العربية الدولية للبنك (سايب)" },
  CIEB: {
    // TradingView-verified: CIEB.CA = Credit Agricole Egypt (not Crédit Industriel)
    nameEn: "Credit Agricole Egypt",
    nameAr: "كريدى اجريكول مصر",
  },
  CCAP: {
    // TradingView-verified: CI Capital was renamed QALA For Financial Investments
    nameEn: "QALA For Financial Investments (formerly CI Capital)",
    nameAr: "قالا للخدمات المالية (سي كابيتال سابقًا)",
  },
  DSCW: {
    // TradingView-verified: DSCW = Dice Sports & Casual Wear (not "Gadwa")
    nameEn: "Dice Sports & Casual Wear",
    nameAr: "دايس سبورت اند كاجوال وير",
    sector: "Consumer",
  },
  EGAL: {
    // TradingView-verified: EGAL = Egypt Aluminum (Al Ezz Al Dekheila is EZDK's plant, not this listing)
    nameEn: "Egypt Aluminum (Egyptalum)",
    nameAr: "مصر للألمنيوم (إيجيبتالوم)",
  },
  ARCC: { nameEn: "Arabian Cement Company" },
  GOUR: {
    // TradingView: Retail trade — Gourmet Egypt is an online food retailer
    nameEn: "Gourmet Egypt (Online Food Retail)",
    sector: "Consumer",
  },
}

const STMT_TYPES = new Set(["income_statement", "balance_sheet", "cash_flow", "other"])
const VALUE_STATEMENT_TYPE = {
  income_statement: "INCOME_STATEMENT",
  balance_sheet: "BALANCE_SHEET",
  cash_flow: "CASH_FLOW",
  other: "OTHER",
}

// Codes whose values are naturally per-share or ratios — never rescaled
const NATURAL_CODES = new Set([
  "BASIC_EPS", "DILUTED_EPS", "EPS", "BOOK_VALUE_PER_SHARE", "DIVIDEND_PER_SHARE",
  "DPS_DECLARED", "EFFECTIVE_TAX_RATE", "PAYOUT_RATIO",
])

/**
 * Normalize one source record to plain EGP (or natural units).
 * - Records that went through the Yahoo merge (sources include YAHOO_FINANCE_API)
 *   are already plain EGP / natural units.
 * - Reuters-ONLY records keep Reuters' display unit = MILLIONS — rescale ×1e6
 *   for monetary codes and share counts; per-share/ratio codes stay natural.
 */
function normalizeRecordValue(r) {
  // the supplement export carries source_type but no sources[] array — key off
  // source_type so Yahoo-sourced supplement rows are NOT treated as Reuters-only
  const reutersOnly = r.source_type === "REUTERS_FINANCIALS_PAGE" && !(r.sources || []).includes("YAHOO_FINANCE_API")
  if (!reutersOnly || NATURAL_CODES.has(r.metric_code)) {
    return { value: r.value, rescaled: false }
  }
  return { value: r.value * 1e6, rescaled: true }
}

// Period mapping: pipeline period_type -> app period model
function mapPeriod(pt, fiscalYear, periodEnd) {
  const year = fiscalYear
  const end = new Date(periodEnd)
  const start = (days) => new Date(end.getTime() - days * 86400000)
  switch (pt) {
    case "FY":
      return { periodType: "ANNUAL", periodLabel: `FY ${year}`, reportType: "ANNUAL", periodStart: start(364) }
    case "Q1":
      return { periodType: "QUARTERLY", periodLabel: `Q1 ${year}`, reportType: "INTERIM", periodStart: start(89) }
    case "H1":
      return { periodType: "SEMIANNUAL", periodLabel: `H1 ${year}`, reportType: "INTERIM", periodStart: start(181) }
    case "9M":
      return { periodType: "NINE_MONTH", periodLabel: `9M ${year}`, reportType: "INTERIM", periodStart: start(273) }
    default:
      return { periodType: "OTHER", periodLabel: `${pt} ${year}`.trim(), reportType: "OTHER", periodStart: null }
  }
}

async function main() {
  const t0 = Date.now()
  console.log("== EGX data import ==")

  // ---- load source data ----------------------------------------------------
  const universe = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "universe.json"), "utf8"))
  const unified = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "financials-unified.json"), "utf8"))

  // optional late-fetched supplements: records the earlier unified export
  // lacked (egx-all-new-records-merged.json from the sandbox pipeline +
  // egx-yfinance-supplement.json from scripts/fetch_missing.py). Merged by
  // (ticker, period, metric): unified rows win on collision; new rows added.
  const seen = new Set(
    unified.records.map((r) => `${r.ticker}|${r.period}|${r.metric_code}|${r.statement_type}`)
  )
  let mergedCount = 0
  for (const name of ["egx-all-new-records-merged.json", "egx-yfinance-supplement.json", "mubasher-supplement.json", "financials-coverage-gaps-fetched.json", "financials-final-batch.json", "financials-creative-approach.json", "financials-creative-round2.json"]) {
    const p = path.join(DATA_DIR, name)
    if (!fs.existsSync(p)) continue
    const merged = JSON.parse(fs.readFileSync(p, "utf8"))
    let added = 0
    for (const r of merged.records || []) {
      const k = `${r.ticker}|${r.period}|${r.metric_code}|${r.statement_type}`
      if (seen.has(k)) continue
      seen.add(k)
      unified.records.push(r)
      added++
    }
    mergedCount += added
    console.log(`merged supplement: +${added} records from ${name}`)
  }
  console.log(`merged supplement total: +${mergedCount} records`)

  const records = unified.records
  console.log(`universe: ${universe.companies.length} companies | unified records: ${records.length}`)

  // ---- safety guard: make sure we are on the real app database -------------
  const companyCountBefore = await db.company.count()
  if (companyCountBefore < 30) {
    throw new Error(
      `Database has only ${companyCountBefore} companies — this looks like the wrong/empty database (DATABASE_URL misresolved). Aborting.`
    )
  }
  console.log(`target DB companies: ${companyCountBefore}`)

  // ---- step 0: clean previous import (idempotency) --------------------------
  const delPrices = await db.marketPrice.deleteMany({ where: { sourceName: PRICE_SOURCE } })
  const delReports = await db.financialReport.deleteMany({ where: { parserVersion: PARSER_VERSION } })
  console.log(`cleaned previous import: ${delPrices.count} prices, ${delReports.count} reports`)

  // remove alias-ticker companies created by earlier import runs (only when empty)
  let twinsDeleted = 0
  for (const alias of Object.keys(ALIAS_TO_CANONICAL)) {
    const twin = await db.company.findUnique({ where: { ticker: alias } })
    if (!twin) continue
    const [reports, prices, metrics, events] = await Promise.all([
      db.financialReport.count({ where: { companyId: twin.id } }),
      db.marketPrice.count({ where: { companyId: twin.id } }),
      db.calculatedMetric.count({ where: { companyId: twin.id } }),
      db.financialEvent.count({ where: { companyId: twin.id } }),
    ])
    if (reports === 0 && prices === 0 && metrics === 0 && events === 0) {
      await db.company.delete({ where: { id: twin.id } })
      twinsDeleted++
    } else {
      console.warn(`WARN: alias company ${alias} still has data (reports=${reports}, prices=${prices}) — not deleted`)
    }
  }
  console.log(`alias-ticker companies removed: ${twinsDeleted}`)

  // remove never-listed state entities (only when data-free / import-marked)
  let neverListedDeleted = 0
  for (const ticker of NEVER_LISTED) {
    const c = await db.company.findUnique({ where: { ticker } })
    if (!c) continue
    const [reports, prices, metrics, events] = await Promise.all([
      db.financialReport.count({ where: { companyId: c.id } }),
      db.marketPrice.count({ where: { companyId: c.id } }),
      db.calculatedMetric.count({ where: { companyId: c.id } }),
      db.financialEvent.count({ where: { companyId: c.id } }),
    ])
    if (reports === 0 && prices === 0 && metrics === 0 && events === 0) {
      await db.company.delete({ where: { id: c.id } })
      neverListedDeleted++
    } else {
      console.warn(`WARN: never-listed company ${ticker} still has data — not deleted`)
    }
  }
  console.log(`never-listed companies removed: ${neverListedDeleted}`)

  // ---- step 1: data sources -------------------------------------------------
  for (const name of ["YAHOO_FINANCE_API", "REUTERS_FINANCIALS_PAGE"]) {
    await db.dataSource.upsert({
      where: { name },
      create: { name, kind: "EXTERNAL_API", config: JSON.stringify({ pipeline: "egx-data", version: PARSER_VERSION }) },
      update: { isActive: true },
    })
  }

  // ---- step 2: companies upsert (canonical tickers only) ----------------------
  // ISIN quality gate: universe.json has duplicate ISINs (a fallback bug —
  // EGS02091C019 shared by ~66 tickers). Only trust an ISIN that is unique
  // inside the universe AND not owned by a different company in the DB.
  const isinSeen = new Map()
  for (const c of universe.companies) {
    if (c.isin) isinSeen.set(c.isin, (isinSeen.get(c.isin) || 0) + 1)
  }
  const dbIsins = new Set(
    (await db.company.findMany({ where: { isin: { not: null } }, select: { isin: true } })).map((r) => r.isin)
  )

  let created = 0, updated = 0, isinSkipped = 0, neverListedSkipped = 0
  for (const c of universe.companies) {
    const ticker = canonicalTicker(c.ticker)
    if (NEVER_LISTED.has(ticker)) { neverListedSkipped++; continue }
    const ov = CANONICAL_OVERRIDES[ticker] || {}
    const nameEnOv = ov.nameEn || c.name_en || ticker
    const nameArOv = ov.nameAr || c.name_ar || null
    const sectorOv = ov.sector || c.sector || "Other"
    const existing = await db.company.findUnique({ where: { ticker } })
    const isinTrusted =
      c.isin && isinSeen.get(c.isin) === 1 && !dbIsins.has(c.isin) &&
      !(existing && existing.isin && existing.isin !== c.isin)
    if (c.isin && !isinTrusted) isinSkipped++

    if (existing) {
      const patch = {}
      // canonical corrections are enforced on every run (sector/name verified vs EGX)
      if (ov.sector && existing.sector !== ov.sector) patch.sector = ov.sector
      if (ov.nameEn && existing.nameEn !== ov.nameEn) patch.nameEn = ov.nameEn
      if (ov.nameAr && existing.nameAr !== ov.nameAr) patch.nameAr = ov.nameAr
      if (!existing.isin && isinTrusted) patch.isin = c.isin
      if (!existing.nameAr && nameArOv) patch.nameAr = nameArOv
      if (!existing.sourceUrl && c.reuters_url) patch.sourceUrl = c.reuters_url
      if (Object.keys(patch).length) {
        await db.company.update({ where: { id: existing.id }, data: patch })
        updated++
      }
    } else {
      const co = await db.company.create({
        data: {
          ticker,
          nameEn: nameEnOv,
          nameAr: nameArOv,
          sector: sectorOv,
          isin: isinTrusted ? c.isin : null,
          sourceUrl: c.reuters_url || null,
          egxCategory: "MAIN",
          isActive: true,
          isDemoData: false,
        },
      })
      if (isinTrusted) dbIsins.add(c.isin)
      created++
    }
  }
  console.log(`companies: ${created} created, ${updated} updated, ${isinSkipped} ISINs skipped (duplicate/untrusted), ${neverListedSkipped} never-listed skipped`)

  const companyByTicker = new Map()
  for (const co of await db.company.findMany({ select: { id: true, ticker: true } })) {
    companyByTicker.set(co.ticker, co.id)
  }
  const companyIdOf = (rawTicker) => companyByTicker.get(canonicalTicker(rawTicker))

  // ---- step 2b: TradingView canonical list — add EGX-listed companies missing from our universe ----
  const tvListPath = path.join(DATA_DIR, "tradingview-egx-sectors.json")
  if (fs.existsSync(tvListPath)) {
    const tvRows = JSON.parse(fs.readFileSync(tvListPath, "utf8")).map((l) => {
      const [ticker, sector] = l.split("::")
      return { ticker: ticker.trim(), sector: (sector || "").trim() }
    })
    const TV_SECTOR_MAP = {
      "Health technology": "Healthcare", "Health services": "Healthcare",
      "Process industries": "Industrial", "Non-energy minerals": "Industrial", "Producer manufacturing": "Industrial",
      "Industrial services": "Industrial", "Transportation": "Industrial", "Utilities": "Industrial",
      "Energy minerals": "Industrial", "Distribution services": "Industrial",
      "Retail trade": "Consumer", "Consumer services": "Consumer", "Consumer durables": "Consumer", "Miscellaneous": "Consumer",
      "Consumer non-durables": "Food",
      "Electronic technology": "Telecom", "Technology services": "Telecom",
      "Commercial services": "Investment",
      "Finance": "Financial Services",
    }
    let namesCache = null
    try { namesCache = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "tradingview-egx-list.json"), "utf8")).map((l) => { const [t, n] = l.split(" ~ "); return { t: (t || "").trim(), n: (n || "").trim() } }) } catch {}
    let tvCreated = 0
    for (const row of tvRows) {
      if (!row.ticker || row.ticker.length < 4 || NEVER_LISTED.has(row.ticker) || ALIAS_TO_CANONICAL[row.ticker]) continue
      if (/^EGS[0-9A-Z]/.test(row.ticker) || row.ticker.includes('-EGP')) continue // ISIN-like instrument rows, not equity tickers
      if (await db.company.findUnique({ where: { ticker: row.ticker } })) continue
      const m = namesCache && namesCache.find((x) => x.t === row.ticker)
      const nameEn = (m && m.n) || row.ticker
      const lower = nameEn.toLowerCase()
      const sector = lower.includes("bank") ? "Banks" : TV_SECTOR_MAP[row.sector] || "Other"
      await db.company.create({
        data: { ticker: row.ticker, nameEn, sector, egxCategory: "MAIN", isActive: true, isDemoData: false },
      })
      tvCreated++
    }
    console.log(`TradingView universe additions created: ${tvCreated}`)
  }

  // ---- step 3: sharesOutstanding from market snapshots ------------------------
  const marketRows = records.filter(
    (r) => r.statement_type === "market_data" && !r.is_null && r.metric_code === "SHARES_OUTSTANDING"
  )
  let sharesFilled = 0
  for (const r of marketRows) {
    const companyId = companyIdOf(r.ticker)
    if (!companyId || typeof r.value !== "number" || !(r.value > 0)) continue
    const co = await db.company.findUnique({ where: { id: companyId }, select: { sharesOutstanding: true } })
    if (co && co.sharesOutstanding == null) {
      await db.company.update({ where: { id: companyId }, data: { sharesOutstanding: r.value } })
      sharesFilled++
    }
  }
  console.log(`sharesOutstanding filled from market snapshots: ${sharesFilled}`)

  // ---- step 4: metric definitions for codes the app registry lacks -----------
  const statementRecords = records.filter((r) => STMT_TYPES.has(r.statement_type) && !r.is_null)
  const labelByCode = new Map()
  for (const r of statementRecords) {
    if (r.metric_label_yahoo && !labelByCode.has(r.metric_code)) labelByCode.set(r.metric_code, r.metric_label_yahoo)
  }
  const existingDefs = new Set((await db.metricDefinition.findMany({ select: { code: true } })).map((d) => d.code))
  let defsCreated = 0
  for (const [code, label] of labelByCode) {
    if (existingDefs.has(code)) continue
    await db.metricDefinition.create({
      data: {
        code,
        labelEn: label || code,
        statementType: "OTHER",
        description: "Imported from egx-data pipeline (Yahoo Finance / Reuters financials)",
        calcRole: "INPUT",
      },
    })
    defsCreated++
  }
  console.log(`metric definitions created: ${defsCreated}`)

  // ---- step 5: financial reports + values -------------------------------------
  // group statement records by (ticker, period, period_type) — the same period
  // end can carry both fiscal and calendar-typed rows (June-FY companies)
  const groups = new Map()
  for (const r of statementRecords) {
    const key = `${r.ticker}|${r.period}|${r.period_type}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }

  // per-ticker dominant FY period-end month (fiscal calendar fingerprint)
  const fyMonthVotes = new Map()
  for (const [, rows] of groups) {
    const r0 = rows[0]
    if (r0.period_type !== "FY") continue
    const t = canonicalTicker(r0.ticker)
    const month = new Date(r0.period).getMonth()
    if (!fyMonthVotes.has(t)) fyMonthVotes.set(t, new Map())
    const votes = fyMonthVotes.get(t)
    votes.set(month, (votes.get(month) || 0) + rows.length)
  }
  const fyMonthOf = new Map()
  for (const [t, votes] of fyMonthVotes) {
    let best = -1, bestN = -1
    for (const [month, n] of votes) if (n > bestN) { best = month; bestN = n }
    fyMonthOf.set(t, best)
  }

  // Fiscal-calendar filter: cumulative periods end at fixed offsets from the
  // fiscal-year-end month (FY +0, Q1 +3, H1 +6, 9M +9). Groups whose end month
  // doesn't match the ticker's fiscal fingerprint are calendar-basis duplicates
  // (June-FY companies ship both views under the same labels) — dropped.
  const TYPE_OFFSET = { FY: 0, Q1: 3, H1: 6, "9M": 9 }
  const keptGroups = new Map() // labelKey -> { key, rows }
  let calendarRowsDropped = 0
  let labelsDropped = 0
  for (const [key, rows] of groups) {
    const r0 = rows[0]
    const t = canonicalTicker(r0.ticker)
    const fyMonth = fyMonthOf.get(t)
    const offset = TYPE_OFFSET[r0.period_type]
    if (offset !== undefined && fyMonth !== undefined) {
      const wantMonth = (fyMonth + offset) % 12
      const endMonth = new Date(r0.period).getMonth()
      if (endMonth !== wantMonth) {
        calendarRowsDropped += rows.length
        continue
      }
    }
    const mp = mapPeriod(r0.period_type, r0.fiscal_year, r0.period)
    const lk = `${t}|${mp.periodType}|${mp.periodLabel}`
    const incumbent = keptGroups.get(lk)
    if (!incumbent) { keptGroups.set(lk, { key, rows }); continue }
    // residual label collision (ticker without fiscal fingerprint) — keep larger
    if (rows.length > incumbent.rows.length) {
      keptGroups.set(lk, { key, rows })
      labelsDropped += incumbent.rows.length
      console.warn(`WARN: label collision ${lk} — kept ${r0.period} (${rows.length} rows), dropped ${incumbent.rows[0].period} (${incumbent.rows.length} rows)`)
    } else {
      labelsDropped += rows.length
      console.warn(`WARN: label collision ${lk} — kept ${incumbent.rows[0].period} (${incumbent.rows.length} rows), dropped ${r0.period} (${rows.length} rows)`)
    }
  }
  if (calendarRowsDropped) console.warn(`WARN: dropped ${calendarRowsDropped} calendar-basis rows that don't match tickers' fiscal fingerprints`)

  // existing report keys (any status) — never import over them
  const existingReports = await db.financialReport.findMany({
    select: { companyId: true, periodType: true, periodLabel: true, statementType: true },
  })
  const existingKeys = new Set(
    existingReports.map((r) => `${r.companyId}|${r.periodType}|${r.periodLabel}|${r.statementType}`)
  )

  let reportsCreated = 0, valuesCreated = 0, validationRowsCreated = 0
  let skippedExisting = 0, skippedNoCompany = 0
  const identityFailures = []
  const identityResults = []

  for (const [, { key, rows }] of keptGroups) {
    const ticker = canonicalTicker(rows[0].ticker)
    const companyId = companyIdOf(rows[0].ticker)
    if (!companyId) { skippedNoCompany += rows.length; continue }

    const fiscalYear = rows[0].fiscal_year
    const periodEnd = rows[0].period
    const mp = mapPeriod(rows[0].period_type, fiscalYear, periodEnd)
    const statementType = "CONSOLIDATED"

    const uniqueKey = `${companyId}|${mp.periodType}|${mp.periodLabel}|${statementType}`
    if (existingKeys.has(uniqueKey)) { skippedExisting += rows.length; continue }

    const sources = [...new Set(rows.flatMap((r) => r.sources || []))]
    const sourceName = sources.length ? sources.join(" + ") : "YAHOO_FINANCE_API"
    const sourceUrl = rows.find((r) => r.source_url)?.source_url || null

    let report
    try {
      report = await db.financialReport.create({
        data: {
          companyId,
          reportType: mp.reportType,
          periodType: mp.periodType,
          statementType,
          fiscalYear,
          periodLabel: mp.periodLabel,
          periodStart: mp.periodStart,
          periodEnd: new Date(periodEnd),
          language: "EN",
          sourceName,
          sourceUrl,
          processingStatus: "APPROVED",
          approvedBy: "egx-data-import",
          approvedAt: new Date(),
          extractionMethod: EXTRACTION_METHOD,
          parserVersion: PARSER_VERSION,
          extractionConfidence: 1,
          isDemoData: false,
          documentType: "API_IMPORT",
          notes: `Imported from egx-data pipeline (${sourceName}). Extracted at: ${rows[0].extracted_at}. Period-end date from source: ${periodEnd}.`,
        },
      })
    } catch (e) {
      if (e.code === "P2002") { skippedExisting += rows.length; continue }
      throw e
    }
    reportsCreated++

    const valueRows = []
    const seenCodes = new Set()
    // dedupe defensively by metricCode (source data verified dup-free; keep first)
    for (const r of rows) {
      if (typeof r.value !== "number" || !Number.isFinite(r.value)) continue
      if (seenCodes.has(r.metric_code)) continue
      seenCodes.add(r.metric_code)
      const { value, rescaled } = normalizeRecordValue(r)
      valueRows.push({
        companyId,
        reportId: report.id,
        metricCode: r.metric_code,
        originalLabel: r.metric_label_yahoo || r.metric_code,
        value,
        currency: r.currency || "EGP",
        unit: "UNIT",
        normalizedValue: value,
        statementType: VALUE_STATEMENT_TYPE[r.statement_type] || "OTHER",
        subPeriod: "CURRENT",
        extractionMethod: EXTRACTION_METHOD,
        confidence: 1,
        validationStatus: "VALID",
        validationNotes: rescaled
          ? `API import — ${r.source_type} (rescaled ×1e6 from Reuters millions)`
          : `API import — ${r.source_type}${r.source_count > 1 ? ` (${r.source_count} sources agree)` : ""}`,
        isDemoData: false,
      })
    }
    for (let i = 0; i < valueRows.length; i += 40) {
      const res = await db.financialValue.createMany({ data: valueRows.slice(i, i + 40) })
      valuesCreated += res.count
    }

    // balance identity check A ≈ L + E (2%) — stored as a structured validation
    // row so source-data issues surface in the app instead of staying hidden.
    // Yahoo sometimes fills the "Total Liabilities" line with "total liabilities
    // AND equity" (A ≈ L exactly) — when that pattern holds, the identity is
    // satisfied under that interpretation and the row passes with a note.
    const byCode = Object.fromEntries(valueRows.map((v) => [v.metricCode, v.normalizedValue]))
    if (byCode.TOTAL_ASSETS && byCode.TOTAL_LIABILITIES && byCode.TOTAL_EQUITY) {
      const a = byCode.TOTAL_ASSETS
      const l = byCode.TOTAL_LIABILITIES
      const lPlusE = l + byCode.TOTAL_EQUITY
      const denom = Math.max(Math.abs(a), Math.abs(lPlusE), 1)
      const pctStandard = Math.abs(a - lPlusE) / denom
      const pctLeE = Math.abs(a - l) / denom
      let passed, details
      if (pctStandard <= 0.02) {
        passed = true
        details = `Total assets vs total liabilities + total equity — imported source values (Yahoo Finance / Reuters)`
      } else if (pctLeE <= 0.02) {
        passed = true
        details = `Identity holds if TOTAL_LIABILITIES includes equity (assets ≈ liabilities & equity — common Yahoo presentation); treat the liabilities figure with care`
      } else {
        passed = false
        details = `Total assets (${a.toExponential(3)}) ≠ liabilities + equity (${lPlusE.toExponential(3)}) — imported source values (Yahoo Finance / Reuters)`
      }
      identityResults.push({
        reportId: report.id,
        checkName: "BALANCE_SHEET_IDENTITY",
        category: "MATH",
        status: passed ? "PASSED" : "FAILED",
        severity: passed ? "INFO" : "WARNING",
        details,
        discrepancy: Math.min(Math.abs(a - lPlusE), Math.abs(a - l)),
        discrepancyPct: Math.min(pctStandard, pctLeE) * 100,
        expectedValue: pctStandard <= pctLeE ? lPlusE : l,
        actualValue: a,
        toleranceApplied: 2,
      })
      if (!passed) identityFailures.push(`${ticker} ${mp.periodLabel}: ${(pctStandard * 100).toFixed(1)}%`)
    }
  }
  for (let i = 0; i < identityResults.length; i += 40) {
    const res = await db.financialValidationResult.createMany({ data: identityResults.slice(i, i + 40) })
    validationRowsCreated += res.count
  }
  console.log(`reports: ${reportsCreated} created | values: ${valuesCreated} | validation rows: ${validationRowsCreated}`)
  console.log(`skipped (existing report): ${skippedExisting} records, no company: ${skippedNoCompany}, label-collision rows dropped: ${labelsDropped}`)
  console.log(`balance identity failures (>2%): ${identityFailures.length}${identityFailures.length ? " — worst: " + identityFailures.slice(0, 5).join(" | ") : ""}`)

  // ---- step 6: market prices --------------------------------------------------
  const priceRows0 = records.filter(
    (r) => r.statement_type === "market_price" && !r.is_null && typeof r.value === "number" && r.value > 0
  )
  // dedupe defensively by (ticker, period)
  const priceSeen = new Set()
  const priceRows = priceRows0.filter((r) => {
    const k = `${r.ticker}|${r.period}`
    if (priceSeen.has(k)) return false
    priceSeen.add(k)
    return true
  })
  if (priceRows.length !== priceRows0.length) {
    console.warn(`WARN: dropped ${priceRows0.length - priceRows.length} duplicate price rows`)
  }
  let pricesCreated = 0
  for (let i = 0; i < priceRows.length; i += 100) {
    const chunk = priceRows.slice(i, i + 100).flatMap((r) => {
      const companyId = companyIdOf(r.ticker)
      if (!companyId) return []
      return [{
        companyId,
        asOf: new Date(r.period),
        price: r.value,
        currency: "EGP",
        sourceName: PRICE_SOURCE,
        notes: `Monthly close — egx-data pipeline import (${PARSER_VERSION})`,
      }]
    })
    if (chunk.length) {
      const res = await db.marketPrice.createMany({ data: chunk })
      pricesCreated += res.count
    }
  }
  console.log(`market prices created: ${pricesCreated} (of ${priceRows.length} source rows)`)

  // ---- step 7: scale verification via market anchors ---------------------------
  // implied equity = BOOK_VALUE (per share) × SHARES_OUTSTANDING (snapshot)
  // compared with the latest stored FY TOTAL_EQUITY — ratio should be ~1
  // (allowed drift for different snapshot vintages). Catches any residual
  // unit-scale bug that the (scale-invariant) identity check cannot.
  const mdByTicker = new Map()
  for (const r of records.filter((r) => r.statement_type === "market_data" && !r.is_null)) {
    const t = canonicalTicker(r.ticker)
    if (!mdByTicker.has(t)) mdByTicker.set(t, {})
    mdByTicker.get(t)[r.metric_code] = r.value
  }
  const eqRows = await db.financialValue.findMany({
    where: { metricCode: "TOTAL_EQUITY", report: { periodType: "ANNUAL", processingStatus: "APPROVED" } },
    select: { companyId: true, normalizedValue: true, report: { select: { fiscalYear: true } } },
  })
  const eqByCompany = new Map()
  for (const e of eqRows) {
    const prev = eqByCompany.get(e.companyId)
    if (!prev || e.report.fiscalYear > prev.fiscalYear) eqByCompany.set(e.companyId, e)
  }
  let scaleBad = 0, scaleOk = 0
  for (const [ticker, md] of mdByTicker) {
    if (!md.BOOK_VALUE || !md.SHARES_OUTSTANDING) continue
    const companyId = companyByTicker.get(ticker)
    const eq = eqByCompany.get(companyId)
    if (!eq) continue
    const implied = md.BOOK_VALUE * md.SHARES_OUTSTANDING
    const ratio = implied / eq.normalizedValue
    const logDev = Math.abs(Math.log10(ratio))
    if (logDev > 0.6) { scaleBad++; console.warn(`SCALE WARN ${ticker}: implied equity ${implied.toExponential(2)} vs stored ${eq.normalizedValue.toExponential(2)} (ratio ${ratio.toFixed(3)})`) }
    else scaleOk++
  }
  console.log(`scale check (implied vs stored equity): ${scaleOk} ok, ${scaleBad} warned`)

  // ---- audit + summary ----------------------------------------------------------
  await db.auditLog.create({
    data: {
      actor: "egx-data-import",
      action: "IMPORT_EGX_DATA",
      entityType: "Database",
      details: `Imported ${reportsCreated} reports / ${valuesCreated} values / ${pricesCreated} prices; ${created} companies created, ${twinsDeleted} alias twins removed; identity failures: ${identityFailures.length}; scale warnings: ${scaleBad}`,
    },
  })

  const summary = {
    companies: { created, updated, twinsDeleted, neverListedDeleted, total: await db.company.count() },
    reportsCreated,
    valuesCreated,
    validationRowsCreated,
    pricesCreated,
    metricDefinitionsCreated: defsCreated,
    labelsDropped,
    calendarRowsDropped,
    skippedExistingRecords: skippedExisting,
    identityFailures: identityFailures.length,
    scaleWarnings: scaleBad,
    elapsedSeconds: ((Date.now() - t0) / 1000).toFixed(1),
  }
  console.log("SUMMARY " + JSON.stringify(summary, null, 2))
}

main()
  .catch((e) => { console.error("IMPORT FAILED:", e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
