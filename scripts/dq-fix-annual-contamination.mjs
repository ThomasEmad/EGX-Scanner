// Repairs annual reports that mixed H1/9M income-statement values with annual
// balance sheets. The AskBorsa comparison plus the companies' own filings show:
//   EAST FY2025:  net profit 5.382bn (H1) -> 9.711bn; revenue 18.455bn -> 37.382bn;
//                 gross profit 5.701bn -> 12.035bn; OCF sign/scale fixed.
//   EGAL FY2025:  net profit 3.123bn (H1) -> 10.186bn; revenue 12.882bn -> 43.183bn;
//                 gross profit 4.181bn -> 14.959bn; FY2025 balance sheet corrected.
//   EGAL FY2026:  4.909bn (9M) -> 15.491bn with the complete FY2026 balance sheet.
//   CANA FY2025:  5.652bn (9M) -> 6.421bn (official bank release / Reuters);
//                 FY2024 5.003bn -> 5.681bn.
//   EAST FY2026:  4.155bn is H1 2026, not an annual; reclassified and quarantined.
//
//   node scripts/dq-fix-annual-contamination.mjs [--apply|--rollback]
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const ROLLBACK = process.argv.includes("--rollback")
const PATH = "reports/annual-contamination-rollback.json"

const CORRECTIONS = [
  // EAST FY2025 — official company FY2025 results (net revenue 37,382m, gross
  // profit 12,035m, net profit 9,711m) and cash-flow statement.
  { ticker: "EAST", year: 2025, metric: "NET_PROFIT", old: 5_382_337_000, value: 9_711_000_000, note: "official FY2025 net profit 9,711m; stored 5,382m was H1 FY2024/25" },
  { ticker: "EAST", year: 2025, metric: "REVENUE", old: 18_455_275_000, value: 37_382_000_000, note: "official FY2025 net revenue 37,382m; stored 18,455m was H1" },
  { ticker: "EAST", year: 2025, metric: "GROSS_PROFIT", old: 5_701_123_000, value: 12_035_000_000, note: "official FY2025 gross profit 12,035m; stored 5,701m was H1" },
  { ticker: "EAST", year: 2025, metric: "COGS", old: 12_754_152_000, value: 25_347_000_000, note: "FY2025 revenue 37,382m - gross profit 12,035m = COGS 25,347m" },
  { ticker: "EAST", year: 2025, metric: "OPERATING_CASH_FLOW", old: 23_755_340_888.01, value: -23_650_000_000, note: "official FY2025 OCF is negative 23.65bn; stored value had the wrong sign/scale" },
  { ticker: "EAST", year: 2025, metric: "INVESTING_CASH_FLOW", old: 12_683_320_000, value: 16_530_000_000, note: "official FY2025 investing cash flow 16.53bn" },
  { ticker: "EAST", year: 2025, metric: "FINANCING_CASH_FLOW", old: -8_853_192_000, value: -9_030_000_000, note: "official FY2025 financing cash flow -9.03bn; legs now sum to net change -16.15bn" },
  // EGAL FY2025 — official FY2024/25 results (net profit 10.186bn, revenue
  // 43.183bn, gross profit 14.959bn, assets 29.337bn, equity 22.374bn).
  { ticker: "EGAL", year: 2025, metric: "NET_PROFIT", old: 3_122_747_462, value: 10_186_000_000, note: "official FY2024/25 net profit 10.186bn; stored 3.123bn was H1" },
  { ticker: "EGAL", year: 2025, metric: "REVENUE", old: 12_882_013_627, value: 43_183_000_000, note: "official FY2024/25 revenue 43.183bn; stored 12.882bn was H1" },
  { ticker: "EGAL", year: 2025, metric: "COGS", old: 8_700_680_293, value: 28_224_000_000, note: "FY2025 revenue 43,183m - gross profit 14,959m = COGS 28,224m" },
  { ticker: "EGAL", year: 2025, metric: "GROSS_PROFIT", old: 4_181_333_334, value: 14_959_000_000, note: "official FY2024/25 gross profit 14.959bn; stored 4.181bn was H1" },
  { ticker: "EGAL", year: 2025, metric: "TOTAL_ASSETS", old: 31_974_431_671, value: 29_337_000_000, note: "FY2025 total assets 29.337bn (StockAnalysis/AskBorsa); stored value was a later balance sheet" },
  { ticker: "EGAL", year: 2025, metric: "TOTAL_LIABILITIES", old: 8_034_732_648, value: 6_963_000_000, note: "FY2025 total liabilities 6.963bn" },
  { ticker: "EGAL", year: 2025, metric: "TOTAL_EQUITY", old: 23_939_699_023, value: 22_374_000_000, note: "FY2025 shareholders' equity 22.374bn" },
  { ticker: "EGAL", year: 2025, metric: "TOTAL_EQUITY_AND_LIABILITIES", old: 29_340_000_000, value: 29_337_000_000, note: "FY2025 total liabilities & equity 29.337bn" },
  { ticker: "EGAL", year: 2025, metric: "CURRENT_ASSETS", old: 26_678_784_947, value: 24_475_000_000, note: "FY2025 current assets 24.475bn" },
  { ticker: "EGAL", year: 2025, metric: "NON_CURRENT_ASSETS", old: 5_295_646_724, value: 4_862_000_000, note: "FY2025 non-current assets 4.862bn; current + non-current = 29.337bn" },
  { ticker: "EGAL", year: 2025, metric: "CURRENT_LIABILITIES", old: 7_007_990_948.31, value: 6_782_000_000, note: "FY2025 current liabilities 6.782bn" },
  { ticker: "EGAL", year: 2025, metric: "INVENTORY", old: 9_695_811_117, value: 13_232_000_000, note: "FY2025 inventory 13.232bn" },
  { ticker: "EGAL", year: 2025, metric: "INVESTING_CASH_FLOW", old: -124_719_104, value: 1_660_000_000, note: "FY2025 investing cash flow 1.66bn" },
  { ticker: "EGAL", year: 2025, metric: "FINANCING_CASH_FLOW", old: -775_382_448, value: -3_350_000_000, note: "FY2025 financing cash flow -3.35bn; legs now sum to net change 2.97bn" },
  // CANA — official bank release (2025 net profit EGP 6.4bn, 2024 EGP 5.7bn)
  // and Reuters (6,421.407m / 5,681.25m).
  { ticker: "CANA", year: 2025, metric: "NET_PROFIT", old: 5_652_258_000, value: 6_421_000_000, note: "official 2025 net profit EGP 6.4bn (Reuters 6,421m); stored 5.652bn was 9M" },
  { ticker: "CANA", year: 2025, metric: "TOTAL_EQUITY_AND_LIABILITIES", old: 269_000_000_000, value: 270_122_160_000, note: "total assets 270.122bn; liabilities 249.855bn + equity 20.267bn" },
  { ticker: "CANA", year: 2024, metric: "NET_PROFIT", old: 5_003_440_000, value: 5_681_250_000, note: "official 2024 net profit EGP 5.681bn" },
  { ticker: "CANA", year: 2024, metric: "TOTAL_EQUITY_AND_LIABILITIES", old: 180_000_000_000, value: 180_190_231_000, note: "total assets 180.190bn; liabilities 166.317bn + equity 13.873bn" },
]

const EGAL_FY2026 = [
  ["NET_PROFIT", 15_491_000_000, "FY2026 net income 15,491m"],
  ["NET_PROFIT_PARENT", 15_491_000_000, "FY2026 net income to common 15,491m"],
  ["REVENUE", 53_137_000_000, "FY2026 revenue 53,137m"],
  ["COGS", 33_076_000_000, "FY2026 cost of revenue 33,076m"],
  ["GROSS_PROFIT", 20_061_000_000, "FY2026 gross profit 20,061m"],
  ["TOTAL_ASSETS", 42_553_000_000, "FY2026 total assets 42,553m"],
  ["TOTAL_LIABILITIES", 8_660_690_000, "FY2026 total liabilities 8,660.69m (current 8,459m + non-current 201.69m)"],
  ["TOTAL_EQUITY", 33_892_000_000, "FY2026 shareholders' equity 33,892m"],
  ["TOTAL_EQUITY_AND_LIABILITIES", 42_553_000_000, "FY2026 total liabilities & equity 42,553m"],
  ["CURRENT_ASSETS", 36_508_000_000, "FY2026 current assets 36,508m"],
  ["NON_CURRENT_ASSETS", 6_045_000_000, "FY2026 non-current assets 6,045m"],
  ["CURRENT_LIABILITIES", 8_459_000_000, "FY2026 current liabilities 8,459m"],
  ["NON_CURRENT_LIABILITIES", 201_690_000, "FY2026 non-current liabilities 201.69m"],
  ["INVENTORY", 12_963_000_000, "FY2026 inventory 12,963m"],
  ["CASH_AND_EQUIVALENTS", 12_281_000_000, "FY2026 cash & equivalents 12,281m"],
  ["SHORT_TERM_DEBT", 212_630_000, "FY2026 short-term debt 212.63m"],
  ["TOTAL_DEBT", 212_630_000, "FY2026 total debt 212.63m"],
  ["BASIC_EPS", 37.55, "FY2026 basic EPS EGP 37.55"],
  ["DILUTED_EPS", 37.55, "FY2026 diluted EPS EGP 37.55"],
]

const NON_MONETARY = new Set(["BASIC_EPS", "DILUTED_EPS"])

async function company(ticker) {
  return db.company.findUnique({ where: { ticker }, select: { id: true } })
}
async function reportFor(ticker, year) {
  const c = await company(ticker)
  if (!c) return null
  return db.financialReport.findFirst({ where: { companyId: c.id, fiscalYear: year, periodType: "ANNUAL" }, orderBy: [{ version: "desc" }, { createdAt: "desc" }], select: { id: true, companyId: true, periodType: true, periodLabel: true, reportType: true, periodStart: true, periodEnd: true, sourceName: true, sourceUrl: true, notes: true } })
}
async function valueOf(reportId, metric) {
  return db.financialValue.findFirst({ where: { reportId, metricCode: metric }, select: { id: true, normalizedValue: true, originalValue: true, validationStatus: true, validationNotes: true, isManuallyCorrected: true } })
}
function close(a, b) { const s = Math.max(Math.abs(a), Math.abs(b), 1); return Math.abs(a - b) / s < 1e-6 }

async function main() {
  if (ROLLBACK) {
    if (!existsSync(PATH)) throw new Error(`No rollback file at ${PATH}`)
    const data = JSON.parse(readFileSync(PATH, "utf8"))
    let n = 0
    for (const c of data.corrections ?? []) {
      await db.financialValue.update({ where: { id: c.id }, data: { normalizedValue: c.oldValue, originalValue: c.oldOriginalValue, validationStatus: c.oldStatus, validationNotes: c.oldNotes, isManuallyCorrected: c.oldIsManuallyCorrected, correctedBy: null, correctedAt: null, correctionReason: null } }).catch(() => {})
      n++
    }
    for (const c of data.created ?? []) {
      await db.financialValue.delete({ where: { id: c.id } }).catch(() => {})
      n++
    }
    for (const q of data.quarantines ?? []) {
      await db.financialValue.update({ where: { id: q.id }, data: { validationStatus: q.oldStatus, validationNotes: q.oldNotes } }).catch(() => {})
      n++
    }
    for (const r of data.reports ?? []) {
      await db.financialReport.update({ where: { id: r.id }, data: { periodType: r.oldPeriodType, periodLabel: r.oldPeriodLabel, reportType: r.oldReportType, periodStart: r.oldPeriodStart ? new Date(r.oldPeriodStart) : null, periodEnd: r.oldPeriodEnd ? new Date(r.oldPeriodEnd) : null, sourceName: r.oldSourceName, sourceUrl: r.oldSourceUrl, notes: r.oldNotes } }).catch(() => {})
      n++
    }
    console.log(`Rolled back ${n} change(s)`)
    return
  }

  const rollback = { corrections: [], created: [], quarantines: [], reports: [] }

  for (const f of CORRECTIONS) {
    const r = await reportFor(f.ticker, f.year)
    if (!r) { console.log(`SKIP ${f.ticker} FY${f.year}: report missing`); continue }
    const v = await valueOf(r.id, f.metric)
    if (!v) { console.log(`SKIP ${f.ticker} FY${f.year} ${f.metric}: value missing`); continue }
    if (close(v.normalizedValue, f.value)) { console.log(`OK   ${f.ticker} FY${f.year} ${f.metric} already ${f.value}`); continue }
    if (!close(v.normalizedValue, f.old)) { console.log(`SKIP ${f.ticker} FY${f.year} ${f.metric}: current ${v.normalizedValue} != ${f.old}`); continue }
    console.log(`FIX  ${f.ticker} FY${f.year} ${f.metric} ${v.normalizedValue} -> ${f.value}`)
    rollback.corrections.push({ id: v.id, ticker: f.ticker, year: f.year, metric: f.metric, oldValue: v.normalizedValue, oldOriginalValue: v.originalValue, oldStatus: v.validationStatus, oldNotes: v.validationNotes, oldIsManuallyCorrected: v.isManuallyCorrected })
    if (APPLY) await db.financialValue.update({ where: { id: v.id }, data: { normalizedValue: f.value, originalValue: v.originalValue ?? v.normalizedValue, isManuallyCorrected: true, correctedBy: "annual-contamination-repair", correctedAt: new Date(), correctionReason: f.note, validationStatus: "VALID", validationNotes: `AUDIT_CORRECTION: ${f.note}` } })
  }

  // EGAL FY2026: replace the 9M net profit and fill the complete annual report.
  const egal26 = await reportFor("EGAL", 2026)
  if (!egal26) console.log("SKIP EGAL FY2026: report missing")
  else {
    const oldMeta = { id: egal26.id, oldPeriodType: egal26.periodType, oldPeriodLabel: egal26.periodLabel, oldReportType: egal26.reportType, oldPeriodStart: egal26.periodStart?.toISOString() ?? null, oldPeriodEnd: egal26.periodEnd?.toISOString() ?? null, oldSourceName: egal26.sourceName, oldSourceUrl: egal26.sourceUrl, oldNotes: egal26.notes }
    console.log("META EGAL FY2026 -> period 2025-07-01..2026-06-30, source STOCKANALYSIS_FINANCIALS")
    rollback.reports.push(oldMeta)
    if (APPLY) await db.financialReport.update({ where: { id: egal26.id }, data: { periodType: "ANNUAL", periodLabel: "FY 2026", reportType: "ANNUAL", periodStart: new Date("2025-07-01T00:00:00.000Z"), periodEnd: new Date("2026-06-30T00:00:00.000Z"), sourceName: "STOCKANALYSIS_FINANCIALS", sourceUrl: "https://stockanalysis.com/quote/egx/EGAL/financials/", notes: "FY2026 annual values from StockAnalysis/S&P Global (net income 15,491m, revenue 53,137m, assets 42,553m, equity 33,892m), cross-checked with AskBorsa/Mubasher. Replaces the 9M net profit 4,908.8m." } })
    for (const [metric, value, note] of EGAL_FY2026) {
      const v = await valueOf(egal26.id, metric)
      if (v) {
        if (close(v.normalizedValue, value)) { console.log(`OK   EGAL FY2026 ${metric} already ${value}`); continue }
        console.log(`FIX  EGAL FY2026 ${metric} ${v.normalizedValue} -> ${value}`)
        rollback.corrections.push({ id: v.id, ticker: "EGAL", year: 2026, metric, oldValue: v.normalizedValue, oldOriginalValue: v.originalValue, oldStatus: v.validationStatus, oldNotes: v.validationNotes, oldIsManuallyCorrected: v.isManuallyCorrected })
        if (APPLY) await db.financialValue.update({ where: { id: v.id }, data: { normalizedValue: value, originalValue: v.originalValue ?? v.normalizedValue, isManuallyCorrected: true, correctedBy: "annual-contamination-repair", correctedAt: new Date(), correctionReason: note, validationStatus: "VALID", validationNotes: `AUDIT_CORRECTION: ${note}` } })
      } else {
        console.log(`NEW  EGAL FY2026 ${metric} ${value}`)
        if (APPLY) {
          const created = await db.financialValue.create({ data: { companyId: egal26.companyId, reportId: egal26.id, metricCode: metric, originalLabel: `FY2026 annual summary — ${metric}`, value, currency: "EGP", unit: NON_MONETARY.has(metric) ? "UNIT" : "UNIT", normalizedValue: value, statementType: "CONSOLIDATED", subPeriod: "CURRENT", extractionMethod: "MANUAL_ENTRY", confidence: 1, validationStatus: "VALID", validationNotes: `AUDIT_CORRECTION: ${note}`, sourceText: "StockAnalysis/S&P Global FY2026; AskBorsa/Mubasher FY2025 cross-check" } })
          rollback.created.push({ id: created.id, ticker: "EGAL", year: 2026, metric })
        }
      }
    }
  }

  // EAST FY2026: 4.155bn is calendar H1 2026, not an annual. Reclassify to an
  // interim report and quarantine the value so it cannot enter annual rankings.
  const east26 = await reportFor("EAST", 2026)
  if (!east26) console.log("SKIP EAST FY2026: report missing")
  else {
    const oldMeta = { id: east26.id, oldPeriodType: east26.periodType, oldPeriodLabel: east26.periodLabel, oldReportType: east26.reportType, oldPeriodStart: east26.periodStart?.toISOString() ?? null, oldPeriodEnd: east26.periodEnd?.toISOString() ?? null, oldSourceName: east26.sourceName, oldSourceUrl: east26.sourceUrl, oldNotes: east26.notes }
    console.log("META EAST FY2026 -> H1 2026 interim (2026-01-01..2026-06-30)")
    rollback.reports.push(oldMeta)
    if (APPLY) await db.financialReport.update({ where: { id: east26.id }, data: { periodType: "SEMIANNUAL", periodLabel: "H1 2026", reportType: "INTERIM", periodStart: new Date("2026-01-01T00:00:00.000Z"), periodEnd: new Date("2026-06-30T00:00:00.000Z"), notes: "4,155m is calendar H1 2026 net profit (official 1H 2026 summary), not FY2026 annual; EAST's fiscal year ends 30 June and the FY2026 annual is not yet published." } })
    const v = await valueOf(east26.id, "NET_PROFIT")
    if (v && !(v.validationStatus === "NEEDS_REVIEW" && (v.validationNotes ?? "").includes("H1 2026"))) {
      console.log(`QUAR EAST FY2026 NET_PROFIT ${v.normalizedValue}`)
      rollback.quarantines.push({ id: v.id, ticker: "EAST", year: 2026, metric: "NET_PROFIT", oldStatus: v.validationStatus, oldNotes: v.validationNotes })
      if (APPLY) await db.financialValue.update({ where: { id: v.id }, data: { validationStatus: "NEEDS_REVIEW", validationNotes: "AUDIT_QUARANTINE: 4,155m is H1 2026 (Jan-Jun) net profit, not FY2026 annual; EAST fiscal year ends 30 June and the FY2026 annual is not yet published." } })
    } else console.log("OK   EAST FY2026 NET_PROFIT already quarantined")
  }

  if (APPLY) { mkdirSync("reports", { recursive: true }); writeFileSync(PATH, JSON.stringify(rollback, null, 2), "utf8"); console.log(`\nApplied. Rollback: ${PATH}`) }
  else console.log("\nDry run — re-run with --apply to write.")
}
main().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
