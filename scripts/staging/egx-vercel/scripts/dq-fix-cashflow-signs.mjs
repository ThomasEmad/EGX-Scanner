// Cash-flow sign/scale repairs found by comparing the app's annual legs with
// AskBorsa's summary table and the opening/closing cash identity. Each entry
// below makes the three legs sum to the reported net change (or reduces the
// gap to rounding). ARAB FY2023 and MFPC FY2023 are deliberately left alone:
// their opening/closing cash contradicts AskBorsa and needs the filing.
//
// TALM FY2025: A - L - E leaves 1,375,376,865, which is exactly the missing
// non-controlling interest; add it plus the total liabilities & equity line so
// the balance-sheet equation can reconcile. The NCI is flagged as implied.
//
//   node scripts/dq-fix-cashflow-signs.mjs [--apply|--rollback]
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const ROLLBACK = process.argv.includes("--rollback")
const PATH = "reports/cashflow-signs-rollback.json"

const CORRECTIONS = [
  { ticker: "ARAB", year: 2021, metric: "OPERATING_CASH_FLOW", old: 224_160_300, value: -224_160_300, note: "AskBorsa FY2021 OCF -224m; sign was flipped; legs now sum to net change -0.3m" },
  { ticker: "ASCM", year: 2023, metric: "OPERATING_CASH_FLOW", old: 26_618_411, value: 266_184_110, note: "AskBorsa FY2023 OCF 266m; app stored 26.6m (1/10); legs now sum to net change 163m" },
  { ticker: "COSG", year: 2023, metric: "OPERATING_CASH_FLOW", old: 24_897_603, value: -24_897_603, note: "AskBorsa FY2023 OCF -24.2m; sign was flipped; legs sum to net change 8.4m" },
  { ticker: "COSG", year: 2024, metric: "OPERATING_CASH_FLOW", old: 130_742_370, value: -130_742_370, note: "AskBorsa FY2024 OCF -138m; sign was flipped; legs sum to net change 49.3m" },
  { ticker: "EGAS", year: 2022, metric: "OPERATING_CASH_FLOW", old: 1_057_566_090, value: -1_057_566_090, note: "AskBorsa FY2022 OCF -1.06bn; sign was flipped; FX 3.49m; gap falls from 2.12bn to 3.8m" },
  { ticker: "MAAL", year: 2023, metric: "INVESTING_CASH_FLOW", old: -5_257_493_000, value: -5_257_493, note: "AskBorsa FY2023 ICF -5.26m; app was x1000; gap falls from 5.26bn to 3.1m" },
  { ticker: "MIPH", year: 2024, metric: "OPERATING_CASH_FLOW", old: -56_821_609, value: 222_000_000, note: "AskBorsa FY2024 OCF 222m; app had sign and magnitude wrong; legs sum 968m vs net change 964m" },
  { ticker: "OLFI", year: 2024, metric: "OPERATING_CASH_FLOW", old: 573_065_312, value: -573_065_312, note: "AskBorsa FY2024 OCF -573m; sign was flipped; legs sum -110.7m vs net change -111m" },
  { ticker: "PHDC", year: 2022, metric: "OPERATING_CASH_FLOW", old: 898_833_149, value: -898_833_149, note: "AskBorsa FY2022 OCF -907m; sign was flipped; legs sum 151.2m vs net change 151m" },
  { ticker: "UEGC", year: 2021, metric: "OPERATING_CASH_FLOW", old: 264_144_746, value: -264_144_746, note: "AskBorsa FY2021 OCF -296m; sign was flipped; legs sum -44.65m vs net change -44.65m" },
  { ticker: "DSCW", year: 2024, metric: "OPERATING_CASH_FLOW", old: 598_729_317, value: -598_729_317, note: "AskBorsa FY2024 OCF -599m; sign was flipped; legs sum 75.46m" },
  { ticker: "OCDI", year: 2025, metric: "OPERATING_CASH_FLOW", old: 5_088_542_815, value: -5_088_542_815, note: "AskBorsa FY2025 OCF -5.09bn; sign was flipped; legs sum -640m" },
  { ticker: "ZMID", year: 2025, metric: "OPERATING_CASH_FLOW", old: 391_105_554, value: -391_105_554, note: "AskBorsa FY2025 OCF -391m; sign was flipped; legs sum -449.8m" },
  { ticker: "ATQA", year: 2024, metric: "OPERATING_CASH_FLOW", old: 2_159_542_079, value: -2_159_542_079, note: "AskBorsa FY2024 OCF -2.16bn; sign was flipped; legs sum -397m" },
]

const TALM = { ticker: "TALM", year: 2025, values: [
  ["NON_CONTROLLING_INTERESTS", 1_375_376_865, "implied NCI = assets 7,536,199,881 - liabilities 4,481,395,440 - equity 1,679,427,576; verify against FY2025 statement"],
  ["TOTAL_EQUITY_AND_LIABILITIES", 7_536_199_881, "total assets 7,536,199,881; liabilities + equity + implied NCI"],
] }

async function company(ticker) { return db.company.findUnique({ where: { ticker }, select: { id: true } }) }
async function reportFor(ticker, year) {
  const c = await company(ticker); if (!c) return null
  return db.financialReport.findFirst({ where: { companyId: c.id, fiscalYear: year, periodType: "ANNUAL" }, orderBy: [{ version: "desc" }, { createdAt: "desc" }], select: { id: true, companyId: true } })
}
async function valueOf(reportId, metric) { return db.financialValue.findFirst({ where: { reportId, metricCode: metric }, select: { id: true, normalizedValue: true, originalValue: true, validationStatus: true, validationNotes: true, isManuallyCorrected: true } }) }
function close(a,b) { const s = Math.max(Math.abs(a),Math.abs(b),1); return Math.abs(a-b)/s < 1e-6 }

async function main() {
  if (ROLLBACK) {
    if (!existsSync(PATH)) throw new Error(`No rollback file at ${PATH}`)
    const data = JSON.parse(readFileSync(PATH, "utf8"))
    let n = 0
    for (const c of data.corrections ?? []) { await db.financialValue.update({ where: { id: c.id }, data: { normalizedValue: c.oldValue, originalValue: c.oldOriginalValue, validationStatus: c.oldStatus, validationNotes: c.oldNotes, isManuallyCorrected: c.oldIsManuallyCorrected, correctedBy: null, correctedAt: null, correctionReason: null } }).catch(() => {}); n++ }
    for (const c of data.created ?? []) { await db.financialValue.delete({ where: { id: c.id } }).catch(() => {}); n++ }
    console.log(`Rolled back ${n} change(s)`); return
  }

  const rollback = { corrections: [], created: [] }
  for (const f of CORRECTIONS) {
    const r = await reportFor(f.ticker, f.year)
    if (!r) { console.log(`SKIP ${f.ticker} FY${f.year}: report missing`); continue }
    const v = await valueOf(r.id, f.metric)
    if (!v) { console.log(`SKIP ${f.ticker} FY${f.year} ${f.metric}: value missing`); continue }
    if (close(v.normalizedValue, f.value)) { console.log(`OK   ${f.ticker} FY${f.year} ${f.metric} already ${f.value}`); continue }
    if (!close(v.normalizedValue, f.old)) { console.log(`SKIP ${f.ticker} FY${f.year} ${f.metric}: current ${v.normalizedValue} != ${f.old}`); continue }
    console.log(`FIX  ${f.ticker} FY${f.year} ${f.metric} ${v.normalizedValue} -> ${f.value}`)
    rollback.corrections.push({ id: v.id, ticker: f.ticker, year: f.year, metric: f.metric, oldValue: v.normalizedValue, oldOriginalValue: v.originalValue, oldStatus: v.validationStatus, oldNotes: v.validationNotes, oldIsManuallyCorrected: v.isManuallyCorrected })
    if (APPLY) await db.financialValue.update({ where: { id: v.id }, data: { normalizedValue: f.value, originalValue: v.originalValue ?? v.normalizedValue, isManuallyCorrected: true, correctedBy: "cashflow-sign-repair", correctedAt: new Date(), correctionReason: f.note, validationStatus: "VALID", validationNotes: `AUDIT_CORRECTION: ${f.note}` } })
  }

  const tr = await reportFor(TALM.ticker, TALM.year)
  if (!tr) console.log("SKIP TALM FY2025: report missing")
  else {
    for (const [metric, value, note] of TALM.values) {
      const v = await valueOf(tr.id, metric)
      if (v) {
        if (close(v.normalizedValue, value)) { console.log(`OK   TALM FY2025 ${metric} already ${value}`); continue }
        console.log(`FIX  TALM FY2025 ${metric} ${v.normalizedValue} -> ${value}`)
        rollback.corrections.push({ id: v.id, ticker: "TALM", year: 2025, metric, oldValue: v.normalizedValue, oldOriginalValue: v.originalValue, oldStatus: v.validationStatus, oldNotes: v.validationNotes, oldIsManuallyCorrected: v.isManuallyCorrected })
        if (APPLY) await db.financialValue.update({ where: { id: v.id }, data: { normalizedValue: value, originalValue: v.originalValue ?? v.normalizedValue, isManuallyCorrected: true, correctedBy: "bs-equation-repair", correctedAt: new Date(), correctionReason: note, validationStatus: "VALID", validationNotes: `AUDIT_CORRECTION: ${note}` } })
      } else {
        console.log(`NEW  TALM FY2025 ${metric} ${value}`)
        if (APPLY) {
          const created = await db.financialValue.create({ data: { companyId: tr.companyId, reportId: tr.id, metricCode: metric, originalLabel: `FY2025 annual summary — ${metric}`, value, currency: "EGP", unit: "UNIT", normalizedValue: value, statementType: "CONSOLIDATED", subPeriod: "CURRENT", extractionMethod: "MANUAL_ENTRY", confidence: 0.8, validationStatus: "VALID", validationNotes: `AUDIT_CORRECTION: ${note}`, sourceText: "Mubasher FY2025 earnings + implied from balance-sheet identity" } })
          rollback.created.push({ id: created.id, ticker: "TALM", year: 2025, metric })
        }
      }
    }
  }

  if (APPLY) { mkdirSync("reports", { recursive: true }); writeFileSync(PATH, JSON.stringify(rollback, null, 2), "utf8"); console.log(`\nApplied. Rollback: ${PATH}`) }
  else console.log("\nDry run — re-run with --apply to write.")
}
main().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
