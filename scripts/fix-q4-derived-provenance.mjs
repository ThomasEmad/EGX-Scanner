// Correct the provenance of Q4 balance-sheet values that were copied from the
// app's own annual report (not from AskBorsa).  The original recovery script
// labelled them as AskBorsa quarterly values; this script makes the source
// explicit and marks them DERIVED.
//
//   node scripts/fix-q4-derived-provenance.mjs            # dry run
//   node scripts/fix-q4-derived-provenance.mjs --apply
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")

async function main() {
  const values = await db.financialValue.findMany({
    where: {
      extractionMethod: "ASKBORA_QUARTERLY",
      validationNotes: { contains: "Q4_EQUALS_APP_FY" },
    },
    select: {
      id: true, metricCode: true, originalLabel: true, validationNotes: true,
      report: { select: { fiscalYear: true, sourceUrl: true } },
    },
  })
  console.log(`Q4-derived values: ${values.length}`)
  console.log(values.slice(0, 5))
  if (!APPLY) return

  let changed = 0
  for (const v of values) {
    await db.financialValue.update({
      where: { id: v.id },
      data: {
        extractionMethod: "DERIVED",
        originalLabel: `${v.metricCode} (Q4 balance sheet copied from annual FY${v.report.fiscalYear})`,
        validationNotes: `Q4_EQUALS_APP_FY: only-missing Q4 balance-sheet line copied from the app's own annual report for FY${v.report.fiscalYear}; not an AskBorsa value.`,
        sourceText: v.report.sourceUrl ?? null,
      },
    })
    changed++
  }
  await db.auditLog.create({
    data: {
      actor: "system",
      action: "VALIDATE",
      entityType: "FinancialValue",
      details: `Q4 provenance correction: ${changed} values relabelled DERIVED (copied from app annual report, not AskBorsa).`,
    },
  })
  console.log(`updated: ${changed}`)
}

main()
  .catch((e) => { console.error("Q4 PROVENANCE FIX FAILED:", e); process.exitCode = 1 })
  .finally(async () => { await db.$disconnect() })
