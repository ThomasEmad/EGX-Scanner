// Repairs the remaining provable mapping/sign/unit errors found by audit v2.
//   node scripts/dq-fix-current-criticals.mjs [--apply|--rollback]
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const ROLLBACK = process.argv.includes("--rollback")
const PATH = "reports/current-criticals-rollback.json"

const CORRECTIONS = [
  { ticker: "SPHT", year: 2022, period: "ANNUAL", metric: "NON_CURRENT_ASSETS", old: 387_414_382, value: 38_741_438.2, note: "x10 scale error: current assets 472,352 + non-current 38,741,438.2 = total assets 39,213,790" },
  { ticker: "DAPH", year: 2025, period: "ANNUAL", metric: "GROSS_PROFIT", old: 38_720_000, value: -38_720_000, note: "revenue 542.91m - COGS 581.63m = -38.72m; stored sign was flipped" },
  { ticker: "AMER", year: 2026, period: "Q2", metric: "COGS", old: -98_899_900, value: 98_899_900, note: "cost of revenue is an expense; negative sign was a Yahoo derivation error" },
  { ticker: "AMER", year: 2026, period: "Q2", metric: "GROSS_PROFIT", old: -271_114_258, value: 73_314_458, note: "revenue 172,214,358 - COGS 98,899,900 = 73,314,458; stored value was the negative of the correct gross profit" },
  { ticker: "EGAS", year: 2024, period: "ANNUAL", metric: "PROFIT_BEFORE_TAX", old: 315.79712, value: 315_797_120, note: "Reuters value was still in millions; note said x1e6 but the stored number was not rescaled" },
  { ticker: "EGAS", year: 2024, period: "ANNUAL", metric: "INCOME_TAX", old: 248_365.1, value: 248_365_100, note: "Reuters value was still in millions; x1e6 rescale was missing" },
  { ticker: "EGAS", year: 2024, period: "ANNUAL", metric: "OPERATING_INCOME", old: 654.09459, value: 654_094_590, note: "Reuters value was still in millions; x1e6 rescale was missing" },
]

const QUARANTINES = [
  { ticker: "COPR", year: 2023, period: "ANNUAL", metrics: ["CURRENT_ASSETS", "NON_CURRENT_ASSETS", "CASH_AND_EQUIVALENTS"], reason: "component lines are in thousands while TOTAL_ASSETS is 93.9m; components sum to 531k (0.6%) and cannot be reconciled" },
  { ticker: "ASPI", year: 2023, period: "ANNUAL", metrics: ["CURRENT_ASSETS", "NON_CURRENT_ASSETS"], reason: "holding-company financial investments are not captured in current/non-current assets; components sum to 27.5m vs total assets 1.44bn" },
  { ticker: "ASPI", year: 2024, period: "ANNUAL", metrics: ["CURRENT_ASSETS", "NON_CURRENT_ASSETS"], reason: "holding-company financial investments are not captured in current/non-current assets; components sum to 94.3m vs total assets 2.56bn" },
  { ticker: "EFIC", year: 2025, period: "ANNUAL", metrics: ["CURRENT_ASSETS", "NON_CURRENT_ASSETS"], reason: "component values sum to 5.55bn = total liabilities, not total assets 11.77bn; they were mapped from the liabilities side" },
  { ticker: "NDRL", year: 2020, period: "ANNUAL", metrics: ["CURRENT_ASSETS", "NON_CURRENT_ASSETS"], reason: "current assets 12.21m equals total liabilities and non-current assets 36.64m equals total assets; both were mapped from the wrong lines" },
  { ticker: "SPHT", year: 2021, period: "ANNUAL", metrics: ["GROSS_PROFIT"], reason: "gross profit 1.92m exceeds revenue 0.85m and is not revenue - COGS (-0.22m); the line is a different item" },
  { ticker: "SPHT", year: 2022, period: "ANNUAL", metrics: ["GROSS_PROFIT"], reason: "gross profit 1.91m exceeds revenue 0.54m and is not revenue - COGS (-0.82m); the line is a different item" },
  { ticker: "UEGC", year: 2021, period: "ANNUAL", metrics: ["CURRENT_ASSETS", "NON_CURRENT_ASSETS"], reason: "current assets 19.18bn is 23x total assets 832m; the component lines are on a different scale" },
]

function close(a, b) { const s = Math.max(Math.abs(a), Math.abs(b), 1); return Math.abs(a - b) / s < 1e-6 }
async function reportFor(companyId, year, period) {
  if (period === "ANNUAL") return db.financialReport.findFirst({ where: { companyId, fiscalYear: year, periodType: "ANNUAL" }, orderBy: [{ version: "desc" }, { createdAt: "desc" }], select: { id: true } })
  return db.financialReport.findFirst({ where: { companyId, fiscalYear: year, periodType: "QUARTERLY", periodLabel: { contains: period } }, orderBy: [{ version: "desc" }, { createdAt: "desc" }], select: { id: true } })
}
async function valueOf(reportId, metric) {
  return db.financialValue.findFirst({ where: { reportId, metricCode: metric }, select: { id: true, normalizedValue: true, validationStatus: true, validationNotes: true, originalValue: true, isManuallyCorrected: true } })
}

async function main() {
  if (ROLLBACK) {
    if (!existsSync(PATH)) throw new Error(`No rollback file at ${PATH}`)
    const data = JSON.parse(readFileSync(PATH, "utf8"))
    let n = 0
    for (const c of data.corrections ?? []) {
      await db.financialValue.update({ where: { id: c.id }, data: { normalizedValue: c.oldValue, validationStatus: c.oldStatus, validationNotes: c.oldNotes, originalValue: c.oldOriginalValue, isManuallyCorrected: c.oldIsManuallyCorrected, correctedBy: null, correctedAt: null, correctionReason: null } }).catch(() => {})
      n++
    }
    for (const q of data.quarantines ?? []) {
      await db.financialValue.update({ where: { id: q.id }, data: { validationStatus: q.oldStatus, validationNotes: q.oldNotes } }).catch(() => {})
      n++
    }
    console.log(`Rolled back ${n} change(s)`)
    return
  }

  const rollback = { corrections: [], quarantines: [] }

  for (const f of CORRECTIONS) {
    const c = await db.company.findUnique({ where: { ticker: f.ticker }, select: { id: true } })
    if (!c) { console.log(`SKIP ${f.ticker}: missing`); continue }
    const r = await reportFor(c.id, f.year, f.period)
    if (!r) { console.log(`SKIP ${f.ticker} ${f.year} ${f.period}: report missing`); continue }
    const v = await valueOf(r.id, f.metric)
    if (!v) { console.log(`SKIP ${f.ticker} ${f.year} ${f.metric}: value missing`); continue }
    if (close(v.normalizedValue, f.value)) { console.log(`OK   ${f.ticker} ${f.year} ${f.metric} already ${f.value}`); continue }
    if (!close(v.normalizedValue, f.old)) { console.log(`SKIP ${f.ticker} ${f.year} ${f.metric}: current ${v.normalizedValue} != ${f.old}`); continue }
    console.log(`FIX  ${f.ticker} ${f.year} ${f.metric} ${v.normalizedValue} -> ${f.value}`)
    rollback.corrections.push({ id: v.id, ticker: f.ticker, year: f.year, metric: f.metric, oldValue: v.normalizedValue, oldStatus: v.validationStatus, oldNotes: v.validationNotes, oldOriginalValue: v.originalValue, oldIsManuallyCorrected: v.isManuallyCorrected })
    if (APPLY) await db.financialValue.update({ where: { id: v.id }, data: { normalizedValue: f.value, originalValue: v.originalValue ?? v.normalizedValue, isManuallyCorrected: true, correctedBy: "audit-critical-repair", correctedAt: new Date(), correctionReason: f.note, validationStatus: "VALID", validationNotes: `AUDIT_CORRECTION: ${f.note}` } })
  }

  for (const q of QUARANTINES) {
    const c = await db.company.findUnique({ where: { ticker: q.ticker }, select: { id: true } })
    if (!c) { console.log(`SKIP ${q.ticker}: missing`); continue }
    const r = await reportFor(c.id, q.year, q.period)
    if (!r) { console.log(`SKIP ${q.ticker} ${q.year}: report missing`); continue }
    for (const metric of q.metrics) {
      const v = await valueOf(r.id, metric)
      if (!v) { console.log(`SKIP ${q.ticker} ${q.year} ${metric}: missing`); continue }
      if (v.validationStatus === "NEEDS_REVIEW" && (v.validationNotes ?? "").includes(q.reason)) { console.log(`OK   ${q.ticker} ${q.year} ${metric} already quarantined`); continue }
      console.log(`QUAR ${q.ticker} ${q.year} ${metric}`)
      rollback.quarantines.push({ id: v.id, ticker: q.ticker, year: q.year, metric, oldStatus: v.validationStatus, oldNotes: v.validationNotes })
      if (APPLY) await db.financialValue.update({ where: { id: v.id }, data: { validationStatus: "NEEDS_REVIEW", validationNotes: `AUDIT_QUARANTINE: ${q.reason}` } })
    }
  }

  if (APPLY) { mkdirSync("reports", { recursive: true }); writeFileSync(PATH, JSON.stringify(rollback, null, 2), "utf8"); console.log(`\nApplied. Rollback: ${PATH}`) }
  else console.log("\nDry run — re-run with --apply to write.")
}
main().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
