// Repairs the balance-sheet identity after the sign/scale corrections.
//
//   node scripts/dq-fix-bs-liabilities.mjs            # dry run
//   node scripts/dq-fix-bs-liabilities.mjs --apply    # write
//   node scripts/dq-fix-bs-liabilities.mjs --rollback # undo
//
// The previous liability repair used TOTAL_ASSETS + TOTAL_EQUITY. That is only
// correct when equity is positive; with negative equity it understates
// liabilities by 2x|equity| and breaks assets = liabilities + equity. This script
// sets TOTAL_LIABILITIES = TOTAL_ASSETS - TOTAL_EQUITY for the affected reports
// (a provable accounting identity), syncs parent net profit when the scale fix
// applied to both lines, and quarantines the remaining values that belong to the
// old (wrong-scale / wrong-issuer) report instead of pretending they reconcile.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const ROLLBACK = process.argv.includes("--rollback")
const PATH = "reports/bs-liability-rollback.json"

const LIABILITY_FIXES = [
  { ticker: "SCFM", year: 2025, old: 383_640_000, note: "assets 391.0m - equity (-7.36m) = 398.36m" },
  { ticker: "PRCL", year: 2025, old: 331_000_000, note: "assets 505m - equity (-174m) = 679m" },
  { ticker: "AALR", year: 2025, old: 100_000_000, note: "assets 603m - equity (-503m) = 1,106m" },
  { ticker: "ALEX", year: 2019, old: 3_883_000_000, note: "assets 4,160m - equity (-277m) = 4,437m" },
  { ticker: "SIPC", year: 2025, old: 2_274_378_936, note: "assets 169m - equity 106m = 63m" },
  { ticker: "UNIT", year: 2024, old: 2_829_700_000, note: "assets 1,920m - equity 795m = 1,125m" },
  { ticker: "COPR", year: 2024, old: 6_212_379, note: "assets 95.05m - equity 81.23m = 13.82m" },
  { ticker: "GSSC", year: 2025, old: 3_662_119_861.3, note: "assets 4,058.83m - equity 778m = 3,280.83m" },
  { ticker: "MHOT", year: 2025, old: 1_400_005_529, note: "assets 4,654.25m - equity 3,367.31m = 1,286.94m" },
]

const PARENT_FIXES = [
  { ticker: "MHOT", year: 2025, old: 138_939_316, value: 1_389_393_160, note: "same x10 scale slip as NET_PROFIT" },
  { ticker: "GSSC", year: 2025, old: 265_160_968.67, value: 135_000_000, note: "same annual-copy correction as NET_PROFIT" },
  { ticker: "COPR", year: 2024, old: -3_712_047, value: 4_010_000, note: "AskBorsa headline net profit is +4.01m; old parent was the pre-correction loss" },
]

const OTHER_FIXES = [
  { ticker: "MHOT", year: 2025, metric: "TOTAL_EQUITY_AND_LIABILITIES", old: 6_150_000_000, value: 4_654_246_877, note: "must equal TOTAL_ASSETS; old value was a different-period total" },
]

// Values from the old wrong-scale / wrong-issuer report. Quarantined, not deleted.
const QUARANTINES = [
  { ticker: "UNIT", year: 2024, period: "ANNUAL", metrics: [
    "CURRENT_ASSETS","NON_CURRENT_ASSETS","TOTAL_DEBT","LONG_TERM_DEBT","PPE","RETAINED_EARNINGS",
    "PROFIT_BEFORE_TAX","INCOME_TAX","INVENTORY","BASIC_EPS","DILUTED_EPS","NET_INTEREST_INCOME",
    "INTEREST_EXPENSE","EBIT","EBITDA","OPERATING_INCOME","OPERATING_EXPENSES_TOTAL","OTHER_INCOME",
    "OPENING_CASH","CLOSING_CASH","NET_CHANGE_IN_CASH","OPERATING_CASH_FLOW","INVESTING_CASH_FLOW",
    "FINANCING_CASH_FLOW","FREE_CASH_FLOW","CAPEX",
  ], reason: "old Yahoo report was on a 5.28bn asset scale while AskBorsa confirms 1.92bn; component/cash-flow lines belong to the wrong scale and cannot be reconciled" },
  { ticker: "COPR", year: 2024, period: "ANNUAL", metrics: [
    "CURRENT_ASSETS","NON_CURRENT_ASSETS","CASH_AND_EQUIVALENTS","TOTAL_DEBT","LONG_TERM_DEBT","PPE",
    "RETAINED_EARNINGS","PROFIT_BEFORE_TAX","EBIT","EBITDA","OPERATING_INCOME","OPERATING_EXPENSES_TOTAL",
    "INTEREST_EXPENSE","NET_INTEREST_INCOME","OTHER_INCOME","BASIC_EPS","DILUTED_EPS","ACCOUNTS_RECEIVABLE",
    "INTEREST_INCOME","OPENING_CASH","CLOSING_CASH","NET_CHANGE_IN_CASH","OPERATING_CASH_FLOW",
    "INVESTING_CASH_FLOW","FINANCING_CASH_FLOW","FREE_CASH_FLOW","CAPEX",
  ], reason: "old Yahoo report mixed thousand-scale components with AskBorsa totals; only the verified headline and totals are kept" },
  { ticker: "SIPC", year: 2025, period: "ANNUAL", metrics: [
    "OPERATING_CASH_FLOW","INVESTING_CASH_FLOW","FINANCING_CASH_FLOW","NET_CHANGE_IN_CASH",
  ], reason: "cash-flow lines belong to the old 8.29bn company scale; AskBorsa FY2025 total assets are 169m" },
  { ticker: "SIPC", year: 2025, period: "Q1", metrics: [
    "NET_PROFIT","REVENUE","COGS","GROSS_PROFIT","INCOME_TAX","OPERATING_EXPENSES_TOTAL",
    "OPERATING_CASH_FLOW","FINANCING_CASH_FLOW","NET_CHANGE_IN_CASH",
  ], reason: "Q1 2025 flow values are from the old 8.29bn company scale (2.28bn quarterly profit vs 169m assets); BS values are kept" },
  { ticker: "UNIT", year: 2025, period: "Q1", metrics: ["NET_PROFIT"],
    reason: "Q1 2025 net profit 1.30bn conflicts with FY2024 130m and the unverified FY2025 report; ROE 160.7% is not a real return" },
]

function close(a, b) { const s = Math.max(Math.abs(a), Math.abs(b), 1); return Math.abs(a - b) / s < 1e-6 }

async function reportFor(companyId, year, period) {
  if (period === "ANNUAL") return db.financialReport.findFirst({ where: { companyId, fiscalYear: year, periodType: "ANNUAL" }, orderBy: [{ statementType: "asc" }, { createdAt: "desc" }], select: { id: true } })
  return db.financialReport.findFirst({ where: { companyId, fiscalYear: year, periodType: "QUARTERLY", periodLabel: { contains: period } }, orderBy: { createdAt: "desc" }, select: { id: true } })
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

  for (const f of LIABILITY_FIXES) {
    const c = await db.company.findUnique({ where: { ticker: f.ticker }, select: { id: true } })
    if (!c) { console.log(`SKIP ${f.ticker}: missing`); continue }
    const r = await reportFor(c.id, f.year, "ANNUAL")
    if (!r) { console.log(`SKIP ${f.ticker} ${f.year}: report missing`); continue }
    const v = await valueOf(r.id, "TOTAL_LIABILITIES")
    if (!v) { console.log(`SKIP ${f.ticker} ${f.year}: liabilities missing`); continue }
    const assets = await valueOf(r.id, "TOTAL_ASSETS")
    const equity = await valueOf(r.id, "TOTAL_EQUITY")
    if (!assets || !equity) { console.log(`SKIP ${f.ticker} ${f.year}: assets/equity missing`); continue }
    const expected = assets.normalizedValue - equity.normalizedValue
    if (close(v.normalizedValue, expected)) { console.log(`OK   ${f.ticker} ${f.year} liabilities already ${expected}`); continue }
    if (!close(v.normalizedValue, f.old)) { console.log(`SKIP ${f.ticker} ${f.year}: current ${v.normalizedValue} != expected old ${f.old}`); continue }
    console.log(`FIX  ${f.ticker} ${f.year} TOTAL_LIABILITIES ${v.normalizedValue} -> ${expected} (${f.note})`)
    rollback.corrections.push({ id: v.id, ticker: f.ticker, year: f.year, metric: "TOTAL_LIABILITIES", oldValue: v.normalizedValue, oldStatus: v.validationStatus, oldNotes: v.validationNotes, oldOriginalValue: v.originalValue, oldIsManuallyCorrected: v.isManuallyCorrected })
    if (APPLY) await db.financialValue.update({ where: { id: v.id }, data: { normalizedValue: expected, originalValue: v.originalValue ?? v.normalizedValue, isManuallyCorrected: true, correctedBy: "bs-identity-repair", correctedAt: new Date(), correctionReason: f.note, validationStatus: "VALID", validationNotes: `AUDIT_CORRECTION: liabilities set to TOTAL_ASSETS - TOTAL_EQUITY = ${expected} (${f.note})` } })
  }

  for (const f of PARENT_FIXES) {
    const c = await db.company.findUnique({ where: { ticker: f.ticker }, select: { id: true } })
    const r = c && await reportFor(c.id, f.year, "ANNUAL")
    const v = r && await valueOf(r.id, "NET_PROFIT_PARENT")
    if (!v) { console.log(`SKIP ${f.ticker} ${f.year}: parent missing`); continue }
    if (close(v.normalizedValue, f.value)) { console.log(`OK   ${f.ticker} ${f.year} parent already ${f.value}`); continue }
    if (!close(v.normalizedValue, f.old)) { console.log(`SKIP ${f.ticker} ${f.year}: parent current ${v.normalizedValue} != ${f.old}`); continue }
    console.log(`FIX  ${f.ticker} ${f.year} NET_PROFIT_PARENT ${v.normalizedValue} -> ${f.value}`)
    rollback.corrections.push({ id: v.id, ticker: f.ticker, year: f.year, metric: "NET_PROFIT_PARENT", oldValue: v.normalizedValue, oldStatus: v.validationStatus, oldNotes: v.validationNotes, oldOriginalValue: v.originalValue, oldIsManuallyCorrected: v.isManuallyCorrected })
    if (APPLY) await db.financialValue.update({ where: { id: v.id }, data: { normalizedValue: f.value, originalValue: v.originalValue ?? v.normalizedValue, isManuallyCorrected: true, correctedBy: "bs-identity-repair", correctedAt: new Date(), correctionReason: f.note, validationStatus: "VALID", validationNotes: `AUDIT_CORRECTION: ${f.note}` } })
  }

  for (const f of OTHER_FIXES) {
    const c = await db.company.findUnique({ where: { ticker: f.ticker }, select: { id: true } })
    const r = c && await reportFor(c.id, f.year, "ANNUAL")
    const v = r && await valueOf(r.id, f.metric)
    if (!v) { console.log(`SKIP ${f.ticker} ${f.year} ${f.metric}: missing`); continue }
    if (close(v.normalizedValue, f.value)) { console.log(`OK   ${f.ticker} ${f.year} ${f.metric} already ${f.value}`); continue }
    if (!close(v.normalizedValue, f.old)) { console.log(`SKIP ${f.ticker} ${f.year} ${f.metric}: current ${v.normalizedValue} != ${f.old}`); continue }
    console.log(`FIX  ${f.ticker} ${f.year} ${f.metric} ${v.normalizedValue} -> ${f.value}`)
    rollback.corrections.push({ id: v.id, ticker: f.ticker, year: f.year, metric: f.metric, oldValue: v.normalizedValue, oldStatus: v.validationStatus, oldNotes: v.validationNotes, oldOriginalValue: v.originalValue, oldIsManuallyCorrected: v.isManuallyCorrected })
    if (APPLY) await db.financialValue.update({ where: { id: v.id }, data: { normalizedValue: f.value, originalValue: v.originalValue ?? v.normalizedValue, isManuallyCorrected: true, correctedBy: "bs-identity-repair", correctedAt: new Date(), correctionReason: f.note, validationStatus: "VALID", validationNotes: `AUDIT_CORRECTION: ${f.note}` } })
  }

  for (const q of QUARANTINES) {
    const c = await db.company.findUnique({ where: { ticker: q.ticker }, select: { id: true } })
    const r = c && await reportFor(c.id, q.year, q.period)
    if (!r) { console.log(`SKIP ${q.ticker} ${q.year} ${q.period}: report missing`); continue }
    for (const metric of q.metrics) {
      const v = await valueOf(r.id, metric)
      if (!v) { console.log(`SKIP ${q.ticker} ${q.year} ${metric}: missing`); continue }
      if (v.validationStatus === "NEEDS_REVIEW" && (v.validationNotes ?? "").includes(q.reason)) { console.log(`OK   ${q.ticker} ${q.year} ${metric} already quarantined`); continue }
      console.log(`QUAR ${q.ticker} ${q.year} ${metric}: ${v.normalizedValue}`)
      rollback.quarantines.push({ id: v.id, ticker: q.ticker, year: q.year, metric, oldStatus: v.validationStatus, oldNotes: v.validationNotes })
      if (APPLY) await db.financialValue.update({ where: { id: v.id }, data: { validationStatus: "NEEDS_REVIEW", validationNotes: `AUDIT_QUARANTINE: ${q.reason}` } })
    }
  }

  if (APPLY) { mkdirSync("reports", { recursive: true }); writeFileSync(PATH, JSON.stringify(rollback, null, 2), "utf8"); console.log(`\nApplied. Rollback: ${PATH}`) }
  else console.log("\nDry run — re-run with --apply to write.")
}
main().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
