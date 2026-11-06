// Create quarterly reports for the AskBorsa universe additions (the 11
// companies imported by import-askborsa-universe.mjs) using the same
// verification gates as recover-quarterly-askborsa.mjs.
//
//   node scripts/import-askborsa-quarterly-universe.mjs            # dry run
//   node scripts/import-askborsa-quarterly-universe.mjs --apply    # write + rollback
//   node scripts/import-askborsa-quarterly-universe.mjs --rollback # undo
//
// Gates:
//   flow  : Q1+Q2+Q3+Q4 = FY within 5% or EGP 1m; no Q1..Q3 copy of FY
//   stock : Q1..Q3 differ from FY and are within 10x of FY
//   Q4 stock: copied from the app's own annual report, marked DERIVED
import { PrismaClient } from "@prisma/client"
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { statementKind } from "./lib/statement-kind.mjs"

const db = new PrismaClient()
const HARVEST = "reports/askborsa-harvest.json"
const UNIVERSE = "reports/askborsa-universe-rollback.json"
const ROLLBACK = "reports/askborsa-quarterly-universe-rollback.json"
const PLAN = "reports/askborsa-quarterly-universe-plan.json"
const MARK = "ASKBORA_QUARTERLY_UNIVERSE:"
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
}
const FLOW = new Set([
  "NET_PROFIT", "GROSS_PROFIT", "OPERATING_CASH_FLOW",
  "INVESTING_CASH_FLOW", "FINANCING_CASH_FLOW", "NET_CHANGE_IN_CASH",
])
const STOCK = new Set([
  "TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY", "TOTAL_EQUITY_AND_LIABILITIES",
])
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"]

const approx = (a, b) => Math.abs(a - b) <= Math.max(Math.abs(b) * 0.005, 1)
const closeSum = (sum, fy) => Math.abs(sum - fy) <= Math.max(Math.abs(fy) * 0.05, 1_000_000)
const isFuture = (d) => d.getTime() > Date.now() + 86_400_000

function quarterEnd(fiscalYear, startMonth, qIndex) {
  const startYear = startMonth === 1 ? fiscalYear : fiscalYear - 1
  const monthAfter = startMonth - 1 + 3 * (qIndex + 1)
  return new Date(Date.UTC(startYear, monthAfter, 0))
}

function quarterStart(end) {
  const d = new Date(end.getTime())
  d.setUTCMonth(d.getUTCMonth() - 2)
  d.setUTCDate(1)
  return d
}

async function runRollback() {
  if (!existsSync(ROLLBACK)) {
    console.error(`No rollback file at ${ROLLBACK}`)
    process.exit(1)
  }
  const data = JSON.parse(readFileSync(ROLLBACK, "utf8"))
  let values = 0
  let reports = 0
  let skipped = 0
  for (const v of data.values ?? []) {
    const row = await db.financialValue.findUnique({ where: { id: v.id }, select: { id: true, validationNotes: true } })
    if (!row) { skipped++; continue }
    if (!String(row.validationNotes ?? "").startsWith(MARK)) { skipped++; continue }
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
  console.log(`rollback complete: values=${values}, reports=${reports}, skipped=${skipped}`)
}

async function main() {
  if (ROLLBACK_MODE) return runRollback()

  const harvest = JSON.parse(readFileSync(HARVEST, "utf8"))
  const universe = JSON.parse(readFileSync(UNIVERSE, "utf8"))
  const targets = [...new Set((universe.values ?? []).map((v) => v.ticker))].sort()
  const results = new Map((harvest.results ?? []).filter((r) => targets.includes(r.ticker)).map((r) => [r.ticker, r]))

  const companies = await db.company.findMany({
    where: { ticker: { in: targets } },
    select: {
      id: true, ticker: true, nameEn: true,
      reports: {
        where: { deletedAt: null, isDemoData: false, processingStatus: { notIn: ["FAILED", "REJECTED", "DELETED"] } },
        select: {
          id: true, periodType: true, fiscalYear: true, periodLabel: true, statementType: true,
          sourceUrl: true,
          values: { select: { metricCode: true, subPeriod: true, normalizedValue: true } },
        },
      },
    },
  })

  const plans = []
  const skipped = []
  for (const company of companies) {
    const result = results.get(company.ticker)
    if (!result || result.status !== "ok" || !result.fiscalYearStartMonth) {
      skipped.push({ ticker: company.ticker, reason: "NO_HARVEST_OR_CALENDAR" })
      continue
    }
    const pivots = Object.fromEntries(result.pivots.map((p) => [p.period, p]))
    const fy = pivots.FY
    if (!fy) continue
    const annualByYear = new Map()
    for (const r of company.reports) {
      if (r.periodType === "ANNUAL" && r.statementType === "CONSOLIDATED") annualByYear.set(r.fiscalYear, r)
    }
    const existingQuarter = new Set(
      company.reports.filter((r) => r.periodType === "QUARTERLY").map((r) => `${r.fiscalYear}|${r.periodLabel}`),
    )

    for (const year of fy.years ?? []) {
      const annual = annualByYear.get(year)
      if (!annual) { skipped.push({ ticker: company.ticker, year, reason: "NO_ANNUAL_REPORT" }); continue }
      const annualValues = new Map(
        annual.values.filter((v) => v.subPeriod === "CURRENT" || v.subPeriod === null).map((v) => [v.metricCode, v.normalizedValue]),
      )

      for (let qi = 0; qi < 4; qi++) {
        const quarter = QUARTERS[qi]
        const end = quarterEnd(year, result.fiscalYearStartMonth, qi)
        if (isFuture(end)) { skipped.push({ ticker: company.ticker, year, quarter, reason: "FUTURE_PERIOD" }); continue }
        if (existingQuarter.has(`${year}|${quarter} ${year}`)) continue

        const values = []
        for (const row of fy.rows ?? []) {
          const metric = ITEM_TO_METRIC[row.item]
          if (!metric) continue
          const fyv = row.values?.[String(year)]
          if (fyv === null || fyv === undefined || !Number.isFinite(Number(fyv)) || Number(fyv) === 0) continue
          const fyValue = Number(fyv)
          const qv = pivots[quarter]?.rows?.find((r) => r.item === row.item)?.values?.[String(year)]
          const qValue = qv === null || qv === undefined || !Number.isFinite(Number(qv)) ? null : Number(qv)

          if (FLOW.has(metric)) {
            const series = QUARTERS.map((qn) => {
              const v = pivots[qn]?.rows?.find((r) => r.item === row.item)?.values?.[String(year)]
              return v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v)
            })
            if (series.some((v) => v === null)) continue
            if (series.slice(0, 3).some((v) => approx(v, fyValue))) continue
            if (series.slice(0, 3).every((v) => v === 0)) continue
            if (!closeSum(series.reduce((a, b) => a + b, 0), fyValue)) continue
            values.push({ metric, value: series[qi], verifiedBy: "SUM_TO_FY" })
          } else if (STOCK.has(metric)) {
            if (qi === 3) {
              if (annualValues.has(metric)) {
                values.push({ metric, value: annualValues.get(metric), verifiedBy: "Q4_EQUALS_APP_FY" })
              }
              continue
            }
            if (qValue === null || qValue === 0 || approx(qValue, fyValue)) continue
            const ratio = Math.abs(qValue) / Math.abs(fyValue)
            if (ratio > 10 || ratio < 0.1) continue
            values.push({ metric, value: qValue, verifiedBy: "POINT_IN_TIME" })
          }
        }

        if (values.length === 0) continue
        plans.push({
          ticker: company.ticker,
          companyId: company.id,
          fiscalYear: year,
          quarter,
          periodLabel: `${quarter} ${year}`,
          periodStart: quarterStart(end).toISOString(),
          periodEnd: end.toISOString(),
          sourceUrl: result.sourceUrl,
          annualReportId: annual.id,
          values,
        })
      }
    }
  }

  const byCompany = {}
  for (const p of plans) byCompany[p.ticker] = (byCompany[p.ticker] ?? 0) + 1
  const byVerified = {}
  for (const p of plans) for (const v of p.values) byVerified[v.verifiedBy] = (byVerified[v.verifiedBy] ?? 0) + 1
  console.log(`mode: ${APPLY ? "APPLY" : "DRY RUN"}`)
  console.log(`quarterly reports to create: ${plans.length}`)
  console.log(`values to create: ${plans.reduce((n, p) => n + p.values.length, 0)}`)
  console.log(`by company: ${JSON.stringify(byCompany)}`)
  console.log(`by verification: ${JSON.stringify(byVerified)}`)
  console.log(`skipped: ${skipped.length}`)

  if (!APPLY) {
    mkdirSync("reports", { recursive: true })
    writeFileSync(PLAN, JSON.stringify({ generatedAt: new Date().toISOString(), plans, skipped }, null, 2), "utf8")
    console.log(`dry run: wrote ${PLAN}`)
    return
  }

  const rollback = { generatedAt: new Date().toISOString(), reports: [], values: [], skipped }
  let reportCount = 0
  let valueCount = 0
  for (const p of plans) {
    const exists = await db.financialReport.findFirst({
      where: { companyId: p.companyId, periodType: "QUARTERLY", periodLabel: p.periodLabel, statementType: "CONSOLIDATED", deletedAt: null },
      select: { id: true },
    })
    if (exists) { rollback.skipped.push({ ticker: p.ticker, year: p.fiscalYear, quarter: p.quarter, reason: "REPORT_EXISTS" }); continue }
    const report = await db.financialReport.create({
      data: {
        companyId: p.companyId,
        reportType: "INTERIM",
        periodType: "QUARTERLY",
        statementType: "CONSOLIDATED",
        fiscalYear: p.fiscalYear,
        periodLabel: p.periodLabel,
        periodStart: new Date(p.periodStart),
        periodEnd: new Date(p.periodEnd),
        language: "AR",
        sourceName: "ASKBORA_PUBLIC",
        sourceUrl: p.sourceUrl,
        processingStatus: "EXTRACTED",
        extractionMethod: "ASKBORA_HARVEST",
        parserVersion: "askborsa-quarterly@1",
        extractionConfidence: 0.8,
        isDemoData: false,
        version: 1,
        notes: `AskBorsa public pivot ${p.quarter} ${p.fiscalYear}; discrete quarter verified by ${[...new Set(p.values.map((v) => v.verifiedBy))].join(" + ")}; annual report ${p.annualReportId}.`,
      },
      select: { id: true },
    })
    rollback.reports.push({ id: report.id, ticker: p.ticker, fiscalYear: p.fiscalYear, quarter: p.quarter })
    reportCount++

    for (const v of p.values) {
      const row = await db.financialValue.create({
        data: {
          companyId: p.companyId,
          reportId: report.id,
          metricCode: v.metric,
          originalLabel: `${v.metric} (AskBorsa ${p.quarter} ${p.fiscalYear})`,
          value: v.value,
          currency: "EGP",
          unit: "UNIT",
          normalizedValue: v.value,
          statementType: statementKind(v.metric),
          subPeriod: "CURRENT",
          extractionMethod: "ASKBORA_HARVEST",
          confidence: v.verifiedBy === "SUM_TO_FY" ? 0.85 : 0.8,
          validationStatus: "VALID",
          validationNotes: `${MARK} ${v.verifiedBy}; source ${p.sourceUrl}`,
          sourceText: p.sourceUrl,
          isDemoData: false,
        },
        select: { id: true },
      })
      rollback.values.push({ id: row.id, ticker: p.ticker, fiscalYear: p.fiscalYear, quarter: p.quarter, metric: v.metric, value: v.value })
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
      details: `ASKBORA_QUARTERLY_UNIVERSE: ${reportCount} quarterly reports, ${valueCount} values for ${targets.length} universe additions; rollback ${ROLLBACK}`,
    },
  })
  console.log(`created: reports=${reportCount}, values=${valueCount}`)
  console.log(`rollback: ${ROLLBACK}`)
}

main()
  .catch((e) => { console.error("ASK BORSA QUARTERLY UNIVERSE FAILED:", e); process.exitCode = 1 })
  .finally(async () => { await db.$disconnect() })
