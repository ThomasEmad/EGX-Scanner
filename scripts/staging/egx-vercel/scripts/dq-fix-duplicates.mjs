/**
 * Quarantine cross-quarter harvest duplicates.
 *
 *   node scripts/dq-fix-duplicates.mjs           # dry run
 *   node scripts/dq-fix-duplicates.mjs --apply   # quarantine the copies
 *
 * A "tab-switch harvest" copy shows up as a later quarter whose values are
 * identical to the previous quarter (±0.05%) across nearly every metric —
 * including flow metrics (revenue, profit, operating cash flow) that cannot be
 * identical two quarters in a row. The later report's values are quarantined
 * (NEEDS_REVIEW + AUDIT_QUARANTINE note), never deleted, and can be restored.
 */
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const ACTOR = "audit-duplicate-fix-v1"
const FLOW = new Set(["REVENUE", "NET_PROFIT", "OPERATING_CASH_FLOW", "GROSS_PROFIT", "PROFIT_BEFORE_TAX", "EPS"])

function close(a, b) {
  if (a === b) return true
  const base = Math.max(Math.abs(a), Math.abs(b))
  if (base === 0) return true
  return Math.abs(a - b) / base <= 0.0005
}

async function main() {
  console.log(`\n=== Cross-quarter duplicate quarantine ${APPLY ? "APPLY" : "DRY RUN"} ===\n`)
  const companies = await db.company.findMany({ select: { id: true, ticker: true } })
  let pairs = 0
  let values = 0
  const examples = []

  for (const co of companies) {
    const reports = await db.financialReport.findMany({
      where: { companyId: co.id, deletedAt: null, periodType: "QUARTERLY" },
      orderBy: { periodEnd: "asc" },
      select: {
        id: true, periodLabel: true, periodEnd: true, fiscalYear: true, notes: true,
        values: {
          select: { id: true, metricCode: true, normalizedValue: true, subPeriod: true, validationStatus: true },
        },
      },
    })

    for (let i = 1; i < reports.length; i++) {
      const prev = reports[i - 1]
      const cur = reports[i]
      if (!prev.values.length || !cur.values.length) continue

      const prevBy = new Map(prev.values.map(v => [v.metricCode + "|" + (v.subPeriod ?? "CURRENT"), v.normalizedValue]))
      let shared = 0
      let identical = 0
      let flowShared = 0
      let flowIdentical = 0
      for (const v of cur.values) {
        const k = v.metricCode + "|" + (v.subPeriod ?? "CURRENT")
        const p = prevBy.get(k)
        if (p === undefined) continue
        shared++
        const same = close(p, v.normalizedValue)
        if (same) identical++
        if (FLOW.has(v.metricCode)) {
          flowShared++
          if (same) flowIdentical++
        }
      }
      // A genuine copy repeats the flow metrics too (revenue, profit, OCF).
      // Stable balance-sheet lines alone are not evidence of a copy.
      if (shared < 5 || flowShared < 1 || flowIdentical !== flowShared) continue
      const ratio = identical / shared
      if (ratio < 0.9) continue

      const curValid = cur.values.filter(v => v.validationStatus === "VALID")
      if (curValid.length === 0) continue
      pairs++
      values += curValid.length
      if (examples.length < 20) examples.push(`${co.ticker} ${cur.periodLabel} repeats ${prev.periodLabel} (${identical}/${shared} = ${(ratio * 100).toFixed(1)}%; ${curValid.length} valid values)`)

      if (APPLY) {
        await db.financialValue.updateMany({
          where: { reportId: cur.id, validationStatus: "VALID" },
          data: {
            validationStatus: "NEEDS_REVIEW",
            validationNotes: `AUDIT_QUARANTINE: cross-quarter duplicate of ${prev.periodLabel} (${identical}/${shared} values identical) — re-extract the later quarter`,
            correctedBy: ACTOR,
            correctedAt: new Date(),
            correctionReason: "later quarter repeats the previous quarter — harvest copy, not an observed filing",
          },
        })
        await db.financialReport.update({
          where: { id: cur.id },
          data: { notes: `${cur.notes ? cur.notes + " | " : ""}AUDIT_QUARANTINE: cross-quarter duplicate of ${prev.periodLabel}; all values quarantined` },
        })
      }
    }
  }

  console.log(`duplicate pairs: ${pairs} | values to quarantine: ${values}`)
  console.log(`\nexamples:\n  ${examples.join("\n  ") || "(none)"}`)
  console.log(APPLY ? "\nChanges written." : "\nDry run — re-run with --apply.")
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
