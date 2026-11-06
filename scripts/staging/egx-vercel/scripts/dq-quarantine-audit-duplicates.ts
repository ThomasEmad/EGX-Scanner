// Quarantine the exact cross-quarter duplicates that the audit itself flagged.
//
//   npx tsx scripts/dq-quarantine-audit-duplicates.ts           # dry run
//   npx tsx scripts/dq-quarantine-audit-duplicates.ts --apply
//
// The audit's CROSS_QUARTER_DUPLICATE finding names the copy and the original:
//   [CROSS_QUARTER_DUPLICATE] Q3 2021 repeats 10/10 values of the previous
//   quarter Q4 2021 — a tab-switch harvest copy; quarantine the later record
// We trust that determination (it is based on a ±0.05% comparison of every
// shared value) and quarantine the copy's VALID values. Reversible, never
// deleted.
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const ACTOR = "audit-duplicate-fix-v2"

async function main() {
  const run = await db.auditRun.findFirst({
    where: { status: "completed" },
    orderBy: { startedAt: "desc" },
    select: { id: true, startedAt: true },
  })
  if (!run) throw new Error("No completed audit run")

  const issues = await db.auditIssue.findMany({
    where: { auditRunId: run.id, status: "open", description: { contains: "CROSS_QUARTER_DUPLICATE" } },
    select: { ticker: true, period: true, description: true },
  })

  let pairs = 0
  let values = 0
  const examples: string[] = []

  for (const issue of issues) {
    const m = issue.description.match(/(Q\d\s+\d{4})\s+repeats.*?quarter\s+(Q\d\s+\d{4})/i)
    const copyLabel = m?.[1] ?? issue.period
    const originalLabel = m?.[2] ?? null
    if (!copyLabel) continue

    const reports = await db.financialReport.findMany({
      where: { company: { ticker: issue.ticker }, periodLabel: copyLabel, periodType: "QUARTERLY", deletedAt: null },
      select: { id: true, periodLabel: true, values: { where: { validationStatus: "VALID" }, select: { id: true } } },
    })

    for (const report of reports) {
      if (report.values.length === 0) continue
      pairs++
      values += report.values.length
      if (examples.length < 20) examples.push(`${issue.ticker} ${copyLabel}${originalLabel ? ` (copy of ${originalLabel})` : ""} — ${report.values.length} values`)
      if (APPLY) {
        await db.financialValue.updateMany({
          where: { reportId: report.id, validationStatus: "VALID" },
          data: {
            validationStatus: "NEEDS_REVIEW",
            validationNotes: `AUDIT_QUARANTINE: cross-quarter duplicate of ${originalLabel ?? "the adjacent quarter"} — audit-confirmed tab-switch copy; re-extract this quarter`,
            correctedBy: ACTOR,
            correctedAt: new Date(),
            correctionReason: "audit-confirmed cross-quarter duplicate — harvest copy, not an observed filing",
          },
        })
      }
    }
  }

  console.log(`\n=== Audit-confirmed duplicate quarantine ${APPLY ? "APPLY" : "DRY RUN"} ===\n`)
  console.log(`pairs: ${pairs} | values: ${values}`)
  console.log(`examples:\n  ${examples.join("\n  ") || "(none)"}`)
  console.log(APPLY ? "\nChanges written." : "\nDry run — re-run with --apply.")
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
