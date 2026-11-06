// Reversible quarantine for a report that provably mixes two companies.
//
// Evidence required before running:
//   * an ASSET_COMPONENTS / balance-sheet identity failure inside the report, and
//   * a component larger than its total (e.g. CURRENT_ASSETS > TOTAL_ASSETS), or
//   * a YoY jump that cannot be explained by the company's own scale.
//
// The report's trustworthy summary totals are kept; every other value is moved
// to NEEDS_REVIEW (the app's quarantine state) with the reason recorded. The
// previous status/notes are written to a rollback file, and the company is
// recomputed so calculated metrics stop using the contaminated values.
//
// Usage:
//   node scripts/quarantine-mixed-company-report.mjs --ticker SIPC --year 2025 [--apply]
//   node scripts/run-recompute.cjs   # after --apply

import fs from "node:fs"
import path from "node:path"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const args = process.argv.slice(2)
const arg = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const ticker = (arg("ticker") ?? "").toUpperCase()
const year = Number(arg("year"))
const apply = args.includes("--apply")

const KEEP = new Set([
  "TOTAL_ASSETS",
  "TOTAL_EQUITY",
  "TOTAL_LIABILITIES",
  "TOTAL_EQUITY_AND_LIABILITIES",
  "NET_PROFIT",
])

if (!ticker || !Number.isFinite(year)) {
  console.error("usage: --ticker <TICKER> --year <YYYY> [--apply] [--recompute]")
  process.exit(2)
}

const company = await db.company.findFirst({ where: { ticker } })
if (!company) {
  console.error(`company ${ticker} not found`)
  process.exit(2)
}

const reports = await db.financialReport.findMany({
  where: { companyId: company.id, fiscalYear: year, periodType: "ANNUAL", deletedAt: null },
  orderBy: { version: "desc" },
  select: { id: true, periodLabel: true, sourceName: true, version: true },
})
if (reports.length === 0) {
  console.error(`no annual report for ${ticker} ${year}`)
  process.exit(2)
}

const reason = `QUARANTINED: report mixes two companies (ASSET_COMPONENTS failure; components exceed the corrected total). Kept summary totals and NET_PROFIT; quarantined the remaining values pending a second source.`
const rollback = []
let changed = 0

for (const report of reports) {
  const values = await db.financialValue.findMany({
    where: { reportId: report.id },
    select: { id: true, metricCode: true, validationStatus: true, validationNotes: true, normalizedValue: true },
    orderBy: { metricCode: "asc" },
  })
  for (const v of values) {
    if (KEEP.has(v.metricCode)) continue
    if (v.validationStatus === "NEEDS_REVIEW") continue
    rollback.push({
      id: v.id,
      reportId: report.id,
      metricCode: v.metricCode,
      normalizedValue: v.normalizedValue,
      oldStatus: v.validationStatus,
      oldNotes: v.validationNotes,
    })
    changed++
    if (apply) {
      await db.financialValue.update({
        where: { id: v.id },
        data: {
          validationStatus: "NEEDS_REVIEW",
          validationNotes: [v.validationNotes, reason].filter(Boolean).join(" | "),
        },
      })
    }
  }
}

const outDir = path.join(process.cwd(), "reports")
const outFile = path.join(outDir, `quarantine-mixed-${ticker}-${year}-rollback.json`)
if (apply) {
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        ticker,
        year,
        companyId: company.id,
        reason,
        appliedAt: new Date().toISOString(),
        keptMetrics: [...KEEP],
        quarantined: rollback,
      },
      null,
      2,
    ),
  )
}

console.log(JSON.stringify({ ticker, year, reports: reports.map((r) => r.periodLabel), quarantined: changed, applied: apply, rollbackFile: apply ? outFile : null }, null, 1))

// Recompute is intentionally separate: run `node scripts/run-recompute.cjs`
// after applying, so one failed company cannot leave the run half-written.
await db.$disconnect()
