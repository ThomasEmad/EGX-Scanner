// Rebuild the fill-validation rollback file from the current quarantine notes.
// Needed after a metadata-only relabel pass overwrote the original rollback.
//
//   node scripts/rebuild-fill-validation-rollback.mjs            # dry run
//   node scripts/rebuild-fill-validation-rollback.mjs --apply
import { PrismaClient } from "@prisma/client"
import { existsSync, readFileSync, writeFileSync } from "node:fs"

const db = new PrismaClient()
const ROLLBACK = "reports/askborsa-fill-validation.json"
const PLAN = "reports/askborsa-fill-validation-plan.json"
const APPLY = process.argv.includes("--apply")

async function main() {
  const values = await db.financialValue.findMany({
    where: {
      validationStatus: "NEEDS_REVIEW",
      validationNotes: { startsWith: "AUDIT_QUARANTINE:", contains: "AskBorsa fill failed" },
    },
    select: {
      id: true, metricCode: true, normalizedValue: true, validationNotes: true,
      report: { select: { periodLabel: true, company: { select: { ticker: true } } } },
    },
  })

  const quarantined = values.map((v) => {
    const note = String(v.validationNotes ?? "")
    const reason = /AskBorsa fill failed (\w+)/.exec(note)?.[1] ?? "UNKNOWN"
    const oldStatus = /Original status: (\w+)/.exec(note)?.[1] ?? "VALID"
    const oldNotes = /Previous note: ([\s\S]*)$/.exec(note)?.[1] ?? null
    return {
      id: v.id,
      ticker: v.report.company.ticker,
      period: v.report.periodLabel,
      metric: v.metricCode,
      value: v.normalizedValue,
      reason,
      oldStatus,
      oldNotes,
      relabelOnly: false,
    }
  })

  const review = existsSync(PLAN)
    ? (JSON.parse(readFileSync(PLAN, "utf8")).review ?? [])
    : []
  console.log(`rebuilt quarantine entries: ${quarantined.length}; review entries preserved: ${review.length}`)
  console.log(quarantined.slice(0, 8))
  if (!APPLY) return
  writeFileSync(ROLLBACK, JSON.stringify({
    generatedAt: new Date().toISOString(),
    rebuiltAt: new Date().toISOString(),
    quarantined,
    review,
  }, null, 2), "utf8")
  console.log(`wrote ${ROLLBACK}`)
}

main()
  .catch((e) => { console.error("REBUILD FAILED:", e); process.exitCode = 1 })
  .finally(async () => { await db.$disconnect() })
