// Import AskBorsa public pivot data for instruments that have no reports yet.
//
//   node scripts/import-askborsa-universe.mjs            # dry run
//   node scripts/import-askborsa-universe.mjs --apply    # write + rollback file
//   node scripts/import-askborsa-universe.mjs --rollback # undo this script
//
// Scope:
//   - active companies already in the database with zero trusted reports
//   - AskBorsa directory tickers that are not in the database at all
//
// Safety rules:
//   - public pages only; no authentication/paywall bypass
//   - EGP pages only (no implicit FX conversion; USD pages are skipped)
//   - fiscal-year start month must be published on the AskBorsa page
//   - only FY (annual) rows; no quarterly rows are used here
//   - no future periodEnd
//   - at least one non-null mapped metric per year
//   - balance-sheet and cash-flow identities are checked; failures are
//     quarantined (validationStatus=NEEDS_REVIEW) instead of silently accepted
//   - values more than 10x/100x away from the company's own median are skipped
//   - every company/report/value created is recorded for rollback
import { PrismaClient } from "@prisma/client"
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { statementKind } from "./lib/statement-kind.mjs"

const db = new PrismaClient()
const HARVEST = "reports/askborsa-harvest.json"
const PLAN = "reports/askborsa-universe-plan.json"
const ROLLBACK = "reports/askborsa-universe-rollback.json"
const APPLY = process.argv.includes("--apply")
const ROLLBACK_MODE = process.argv.includes("--rollback")

const ITEM_TO_METRIC = {
  net_profit: "NET_PROFIT",
  gross_profit: "GROSS_PROFIT",
  total_assets: "TOTAL_ASSETS",
  total_liabilities: "TOTAL_LIABILITIES",
  total_equity: "TOTAL_EQUITY",
  total_liabilities_and_equity: "TOTAL_EQUITY_AND_LIABILITIES",
  cf_operating: "OPERATING_CASH_FLOW",
  cf_investing: "INVESTING_CASH_FLOW",
  cf_financing: "FINANCING_CASH_FLOW",
  net_change_in_cash: "NET_CHANGE_IN_CASH",
  dividends_paid: "DIVIDENDS_PAID",
}

const BALANCE_METRICS = new Set([
  "TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY", "TOTAL_EQUITY_AND_LIABILITIES",
])
const CASH_METRICS = new Set([
  "OPERATING_CASH_FLOW", "INVESTING_CASH_FLOW", "FINANCING_CASH_FLOW", "NET_CHANGE_IN_CASH",
])

const SECTOR_MAP = {
  "banks": "Banks",
  "real-estate": "Real Estate",
  "non-bank-financial": "Financial Services",
  "food-beverages": "Food",
  "healthcare-pharma": "Healthcare",
  "construction": "Construction",
  "basic-resources": "Basic Materials",
  "building-materials": "Building Materials",
  "travel-leisure": "Travel & Leisure",
  "other": "Industrial",
  "textiles-durables": "Textiles",
  "it-media-telecom": "Telecom",
  "shipping-transport": "Transport",
  "trade-distributors": "Trade",
  "energy": "Energy",
  "education": "Education",
  "paper-packaging": "Paper",
  "chemicals": "Basic Materials",
}

// Alternate tickers / duplicate listings that must not become new companies.
const ALIAS_OF = {
  AIH: "AIHC",
  PORT: "ARAB",
  MBEN: "MBEG",
  KASABF: "ODIN",
  FAITA: "FAIT",
  MOBCO: "MOPCO",
  FCMD: "ICMI",
}
const EXCLUDED_TICKERS = new Set(["EGX30ETF"])
const EXCLUDED_NAME_TOKENS = ["etf", "index fund", "exchange traded fund"]

function isFuture(date) {
  return date.getTime() > Date.now() + 86_400_000
}

function median(nums) {
  if (nums.length === 0) return null
  const a = [...nums].sort((x, y) => x - y)
  const mid = Math.floor(a.length / 2)
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2
}

function normalizeName(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/&amp;/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !["the", "for", "and", "co", "company", "sae", "s", "eg", "holding", "group"].includes(w))
    .join(" ")
}

function nameTokens(s) {
  return new Set(normalizeName(s).split(" ").filter(Boolean))
}

function jaccard(a, b) {
  const A = nameTokens(a)
  const B = nameTokens(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  return inter / (A.size + B.size - inter)
}

function fiscalDates(fiscalYear, startMonth) {
  // AskBorsa labels a fiscal year by the calendar year in which it ends
  // (verified against MPCI/AXPH/EAST: July-start FY2024 ends 30 June 2024).
  const startYear = startMonth === 1 ? fiscalYear : fiscalYear - 1
  const start = new Date(Date.UTC(startYear, startMonth - 1, 1))
  const endMonthIndex = (startMonth - 2 + 12) % 12
  const end = new Date(Date.UTC(fiscalYear, endMonthIndex + 1, 0))
  return { start, end }
}

function tolerance(base, absolute = 2_000_000) {
  return Math.max(Math.abs(base) * 0.02, absolute)
}

async function runRollback() {
  if (!existsSync(ROLLBACK)) {
    console.error(`No rollback file at ${ROLLBACK}`)
    process.exit(1)
  }
  const data = JSON.parse(readFileSync(ROLLBACK, "utf8"))
  let values = 0
  let reports = 0
  let companies = 0
  let skipped = 0
  for (const v of data.values ?? []) {
    const row = await db.financialValue.findUnique({ where: { id: v.id }, select: { id: true, validationNotes: true } })
    if (!row) { skipped++; continue }
    if (!String(row.validationNotes ?? "").startsWith("ASKBORA_DIRECTORY:")) { skipped++; continue }
    await db.financialValue.delete({ where: { id: v.id } })
    values++
  }
  for (const r of data.reports ?? []) {
    const row = await db.financialReport.findUnique({ where: { id: r.id }, select: { id: true, sourceName: true, _count: { select: { values: true } } } })
    if (!row) { skipped++; continue }
    if (row.sourceName !== "ASKBORA_PUBLIC") { skipped++; continue }
    if (row._count.values > 0) { skipped++; continue }
    await db.financialReport.delete({ where: { id: r.id } })
    reports++
  }
  for (const c of data.companies ?? []) {
    const row = await db.company.findUnique({ where: { id: c.id }, select: { id: true, sourceUrl: true, _count: { select: { reports: true } } } })
    if (!row) { skipped++; continue }
    if (!String(row.sourceUrl ?? "").startsWith("https://askborsa.com/company/")) { skipped++; continue }
    if (row._count.reports > 0) { skipped++; continue }
    await db.company.delete({ where: { id: c.id } })
    companies++
  }
  console.log(`rollback complete: values=${values}, reports=${reports}, companies=${companies}, skipped=${skipped}`)
}

async function main() {
  if (ROLLBACK_MODE) return runRollback()

  const harvest = JSON.parse(readFileSync(HARVEST, "utf8"))
  const companies = await db.company.findMany({
    select: {
      id: true, ticker: true, nameEn: true, nameAr: true, isActive: true, sector: true,
      _count: { select: { reports: { where: { deletedAt: null } } } },
    },
  })
  const byTicker = new Map(companies.map((c) => [c.ticker, c]))
  const existingNames = companies.map((c) => ({ ticker: c.ticker, nameEn: c.nameEn, nameAr: c.nameAr }))

  const plans = []
  const skipped = []
  for (const result of harvest.results ?? []) {
    if (result.status !== "ok" || !result.pivots) continue
    const fy = result.pivots.find((p) => p.period === "FY")
    if (!fy || !Array.isArray(fy.years) || fy.years.length === 0) continue
    if (result.currency !== "EGP") {
      skipped.push({ ticker: result.ticker, reason: "NON_EGP", currency: result.currency })
      continue
    }
    if (!result.fiscalYearStartMonth) {
      skipped.push({ ticker: result.ticker, reason: "NO_FISCAL_CALENDAR" })
      continue
    }
    const existing = byTicker.get(result.ticker)
    if (existing && existing._count.reports > 0) continue // existing coverage; only-missing fill handles it
    if (existing && !existing.isActive) {
      skipped.push({ ticker: result.ticker, reason: "INACTIVE_COMPANY" })
      continue
    }

    let target = existing ?? null
    if (!target) {
      if (EXCLUDED_TICKERS.has(result.ticker)) {
        skipped.push({ ticker: result.ticker, reason: "EXCLUDED_INSTRUMENT" })
        continue
      }
      if (ALIAS_OF[result.ticker]) {
        skipped.push({ ticker: result.ticker, reason: "ALIAS_OF", canonical: ALIAS_OF[result.ticker] })
        continue
      }
      const nameEn = result.nameEn ?? result.nameAr ?? result.ticker
      if (EXCLUDED_NAME_TOKENS.some((t) => String(nameEn).toLowerCase().includes(t))) {
        skipped.push({ ticker: result.ticker, reason: "FUND_OR_ETF" })
        continue
      }
      const duplicate = existingNames
        .map((e) => ({ ...e, score: Math.max(jaccard(nameEn, e.nameEn), jaccard(nameEn, e.nameAr)) }))
        .filter((e) => e.score >= 0.6)
        .sort((a, b) => b.score - a.score)[0]
      if (duplicate) {
        skipped.push({ ticker: result.ticker, reason: "NAME_DUPLICATE", duplicateOf: duplicate.ticker, score: Number(duplicate.score.toFixed(3)) })
        continue
      }
      const sector = SECTOR_MAP[result.sectorSlug]
      if (!sector) {
        skipped.push({ ticker: result.ticker, reason: "UNKNOWN_SECTOR", sectorSlug: result.sectorSlug })
        continue
      }
      target = {
        id: null,
        ticker: result.ticker,
        nameEn,
        nameAr: result.nameAr,
        sector,
        isActive: true,
        _count: { reports: 0 },
      }
    }

    // Build the year-level plan with scale/identity checks.
    const metricSeries = new Map()
    for (const row of fy.rows ?? []) {
      const metric = ITEM_TO_METRIC[row.item]
      if (!metric) continue
      for (const year of fy.years) {
        const raw = row.values?.[String(year)]
        if (raw === null || raw === undefined || !Number.isFinite(Number(raw))) continue
        if (!metricSeries.has(metric)) metricSeries.set(metric, [])
        metricSeries.get(metric).push(Number(raw))
      }
    }

    for (const year of fy.years) {
      const { start, end } = fiscalDates(year, result.fiscalYearStartMonth)
      if (isFuture(end)) {
        skipped.push({ ticker: result.ticker, year, reason: "FUTURE_PERIOD" })
        continue
      }
      const rows = []
      for (const row of fy.rows ?? []) {
        const metric = ITEM_TO_METRIC[row.item]
        if (!metric) continue
        const raw = row.values?.[String(year)]
        if (raw === null || raw === undefined || !Number.isFinite(Number(raw))) continue
        const value = Number(raw)
        if (value === 0) {
          skipped.push({ ticker: result.ticker, year, metric, reason: "ZERO_VALUE" })
          continue
        }
        const anchors = (metricSeries.get(metric) ?? []).map((v) => Math.abs(v)).filter((v) => v > 0)
        const med = median(anchors)
        if (med !== null && anchors.length >= 2) {
          const maxRatio = BALANCE_METRICS.has(metric) ? 10 : 100
          const ratio = Math.abs(value) / med
          if (ratio > maxRatio || ratio < 1 / maxRatio) {
            skipped.push({ ticker: result.ticker, year, metric, value, reason: "SCALE_SUSPECT", localMedian: med, ratio: Number(ratio.toFixed(4)) })
            continue
          }
        }
        rows.push({ metric, item: row.item, label: row.label, value })
      }
      if (rows.length === 0) {
        skipped.push({ ticker: result.ticker, year, reason: "NO_USABLE_VALUES" })
        continue
      }

      const map = new Map(rows.map((r) => [r.metric, r.value]))
      const quarantine = new Set()
      const notes = []
      const assets = map.get("TOTAL_ASSETS")
      const liabilities = map.get("TOTAL_LIABILITIES")
      const equity = map.get("TOTAL_EQUITY")
      const tle = map.get("TOTAL_EQUITY_AND_LIABILITIES")
      if (assets !== undefined && liabilities !== undefined && equity !== undefined) {
        const gap = assets - (liabilities + equity)
        if (Math.abs(gap) > tolerance(assets)) {
          for (const m of ["TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY"]) quarantine.add(m)
          notes.push(`balance identity gap ${gap}`)
        }
      }
      if (assets !== undefined && tle !== undefined && Math.abs(assets - tle) > tolerance(assets)) {
        quarantine.add("TOTAL_EQUITY_AND_LIABILITIES")
        notes.push(`assets vs liabilities+equity gap ${assets - tle}`)
      }
      const ocf = map.get("OPERATING_CASH_FLOW")
      const icf = map.get("INVESTING_CASH_FLOW")
      const fcf = map.get("FINANCING_CASH_FLOW")
      const netChange = map.get("NET_CHANGE_IN_CASH")
      if (ocf !== undefined && icf !== undefined && fcf !== undefined && netChange !== undefined) {
        const gap = ocf + icf + fcf - netChange
        if (Math.abs(gap) > tolerance(netChange)) {
          for (const m of CASH_METRICS) quarantine.add(m)
          notes.push(`cash-flow identity gap ${gap}`)
        }
      }

      plans.push({
        ticker: result.ticker,
        companyId: target.id,
        company: target,
        year,
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        sourceUrl: result.sourceUrl,
        fiscalYearStartMonth: result.fiscalYearStartMonth,
        rows,
        quarantine: [...quarantine],
        identityNotes: notes,
      })
    }
  }

  const newCompanies = [...new Map(plans.filter((p) => !p.companyId).map((p) => [p.ticker, p.company])).values()]
  const byCompany = {}
  for (const p of plans) byCompany[p.ticker] = (byCompany[p.ticker] ?? 0) + 1
  const byMetric = {}
  for (const p of plans) for (const r of p.rows) byMetric[r.metric] = (byMetric[r.metric] ?? 0) + 1
  const quarantined = plans.reduce((n, p) => n + p.quarantine.length, 0)

  console.log(`mode: ${APPLY ? "APPLY" : "DRY RUN"}`)
  console.log(`companies to create: ${newCompanies.length}`)
  console.log(`reports to create: ${plans.length}`)
  console.log(`values to create: ${plans.reduce((n, p) => n + p.rows.length, 0)} (quarantined metric-years: ${quarantined})`)
  console.log(`companies: ${JSON.stringify(byCompany)}`)
  console.log(`by metric: ${JSON.stringify(byMetric)}`)
  console.log(`skipped: ${skipped.length}`)
  for (const s of skipped.slice(0, 30)) console.log(`  skip ${JSON.stringify(s)}`)

  if (!APPLY) {
    mkdirSync("reports", { recursive: true })
    writeFileSync(PLAN, JSON.stringify({ generatedAt: new Date().toISOString(), newCompanies, plans, skipped }, null, 2), "utf8")
    console.log(`dry run: wrote ${PLAN}`)
    return
  }

  const rollback = { generatedAt: new Date().toISOString(), companies: [], reports: [], values: [], skipped }
  const idByTicker = new Map()
  for (const c of newCompanies) {
    const exists = await db.company.findUnique({ where: { ticker: c.ticker }, select: { id: true } })
    if (exists) { idByTicker.set(c.ticker, exists.id); continue }
    const row = await db.company.create({
      data: {
        ticker: c.ticker,
        nameEn: c.nameEn,
        nameAr: c.nameAr,
        sector: c.sector,
        listingStatus: "LISTED",
        isActive: true,
        isDemoData: false,
        sourceUrl: `https://askborsa.com/company/${c.ticker}`,
        lastVerifiedAt: new Date(),
        descriptionEn: `Added from the AskBorsa public EGX directory on ${new Date().toISOString().slice(0, 10)}. No ISIN is published on the public page.`,
        descriptionAr: `أُضيفت من دليل AskBorsa العام للبورصة المصرية في ${new Date().toISOString().slice(0, 10)}. لا ينشر الموقع العام رمز ISIN.`,
      },
      select: { id: true },
    })
    idByTicker.set(c.ticker, row.id)
    rollback.companies.push({ id: row.id, ticker: c.ticker })
  }

  let reportCount = 0
  let valueCount = 0
  for (const p of plans) {
    const companyId = p.companyId ?? idByTicker.get(p.ticker)
    if (!companyId) { rollback.skipped.push({ ticker: p.ticker, year: p.year, reason: "NO_COMPANY_ID" }); continue }
    const existingReport = await db.financialReport.findFirst({
      where: { companyId, periodType: "ANNUAL", fiscalYear: p.year, statementType: "CONSOLIDATED", deletedAt: null },
      select: { id: true },
    })
    if (existingReport) { rollback.skipped.push({ ticker: p.ticker, year: p.year, reason: "REPORT_EXISTS" }); continue }
    const report = await db.financialReport.create({
      data: {
        companyId,
        reportType: "ANNUAL",
        periodType: "ANNUAL",
        statementType: "CONSOLIDATED",
        fiscalYear: p.year,
        periodLabel: `FY ${p.year}`,
        periodStart: new Date(p.periodStart),
        periodEnd: new Date(p.periodEnd),
        language: "AR",
        sourceName: "ASKBORA_PUBLIC",
        sourceUrl: p.sourceUrl,
        processingStatus: "EXTRACTED",
        extractionMethod: "ASKBORA_HARVEST",
        parserVersion: "askborsa-pivot@2",
        extractionConfidence: 0.8,
        isDemoData: false,
        version: 1,
        notes: `AskBorsa public pivot (FY ${p.year}); fiscal year starts month ${p.fiscalYearStartMonth}; consolidated where published; currency EGP. ${p.identityNotes.length ? `Identity notes: ${p.identityNotes.join("; ")}` : ""}`.trim(),
      },
      select: { id: true },
    })
    rollback.reports.push({ id: report.id, ticker: p.ticker, year: p.year })
    reportCount++

    for (const r of p.rows) {
      const quarantined = p.quarantine.includes(r.metric)
      const note = quarantined
        ? `ASKBORA_DIRECTORY: imported from public AskBorsa pivot; AUDIT_QUARANTINE: ${p.identityNotes.join("; ") || "identity failure"}; source ${p.sourceUrl}`
        : `ASKBORA_DIRECTORY: imported from public AskBorsa pivot (FY ${p.year}); fiscal year starts month ${p.fiscalYearStartMonth}; source ${p.sourceUrl}`
      const value = await db.financialValue.create({
        data: {
          companyId,
          reportId: report.id,
          metricCode: r.metric,
          originalLabel: `${r.label} (AskBorsa FY${p.year})`,
          value: r.value,
          currency: "EGP",
          unit: "UNIT",
          normalizedValue: r.value,
          statementType: statementKind(r.metric),
          subPeriod: "CURRENT",
          extractionMethod: "ASKBORA_HARVEST",
          confidence: 0.8,
          validationStatus: quarantined ? "NEEDS_REVIEW" : "VALID",
          validationNotes: note,
          sourceText: p.sourceUrl,
          isDemoData: false,
        },
        select: { id: true },
      })
      rollback.values.push({ id: value.id, ticker: p.ticker, year: p.year, metric: r.metric, value: r.value, quarantined })
      valueCount++
    }
  }

  mkdirSync("reports", { recursive: true })
  writeFileSync(ROLLBACK, JSON.stringify(rollback, null, 2), "utf8")
  await db.auditLog.create({
    data: {
      actor: "system",
      action: "UPLOAD",
      entityType: "FinancialValue",
      details: `ASKBORA_DIRECTORY import: ${newCompanies.length} companies, ${reportCount} annual reports, ${valueCount} values; ${skipped.length} skipped; rollback ${ROLLBACK}`,
    },
  })
  console.log(`created: companies=${newCompanies.length}, reports=${reportCount}, values=${valueCount}`)
  console.log(`rollback: ${ROLLBACK}`)
}

main()
  .catch((e) => { console.error("ASK BORSA UNIVERSE IMPORT FAILED:", e); process.exitCode = 1 })
  .finally(async () => { await db.$disconnect() })
