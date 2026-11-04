// Reversible quarantine for reports whose period ends in the future.
//
// A future period-end cannot be an announced actual. It is either a forecast
// or a mislabeled annual/interim period. We do not delete it and we do not
// guess a replacement date: the report and its values are moved to
// NEEDS_REVIEW with an AUDIT_QUARANTINE note, and a rollback file is written.
//
// Usage:
//   node scripts/quarantine-future-periods.mjs            # dry run
//   node scripts/quarantine-future-periods.mjs --apply
//   node scripts/quarantine-future-periods.mjs --rollback
import { PrismaClient } from "@prisma/client"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const ROLLBACK = process.argv.includes("--rollback")
const ROLLBACK_FILE = "reports/future-period-quarantine.json"
const TRUSTED = ["VALIDATED", "APPROVED", "EXTRACTED"]
const TOLERANCE_MS = 24 * 3600 * 1000
const cutoff = new Date(Date.now() + TOLERANCE_MS)
const NOTE = "AUDIT_QUARANTINE: period ends in the future — not an announced actual; excluded from read paths pending source verification."

function appendNote(notes) {
  if (notes?.includes("AUDIT_QUARANTINE: period ends in the future")) return notes
  return `${notes ? `${notes} ` : ""}${NOTE}`
}

async function rollback() {
  if (!existsSync(ROLLBACK_FILE)) throw new Error(`rollback file not found: ${ROLLBACK_FILE}`)
  const entries = JSON.parse(readFileSync(ROLLBACK_FILE, "utf8"))
  let reports = 0
  let values = 0
  for (const e of entries.reports ?? []) {
    await db.financialReport.update({
      where: { id: e.reportId },
      data: { processingStatus: e.oldStatus, notes: e.oldNotes },
    })
    reports++
  }
  for (const v of entries.values ?? []) {
    await db.financialValue.update({
      where: { id: v.valueId },
      data: { validationStatus: v.oldStatus, validationNotes: v.oldNotes },
    })
    values++
  }
  console.log(JSON.stringify({ mode: "rollback", reports, values }, null, 2))
}

async function main() {
  if (ROLLBACK) return rollback()

  const reports = await db.financialReport.findMany({
    where: {
      deletedAt: null,
      processingStatus: { in: TRUSTED },
      periodEnd: { gt: cutoff },
    },
    select: {
      id: true,
      periodLabel: true,
      periodType: true,
      periodEnd: true,
      processingStatus: true,
      notes: true,
      company: { select: { ticker: true, nameEn: true } },
      values: { select: { id: true, validationStatus: true, validationNotes: true } },
    },
    orderBy: { periodEnd: "asc" },
  })

  const out = reports.map((r) => ({
    reportId: r.id,
    ticker: r.company.ticker,
    company: r.company.nameEn,
    periodLabel: r.periodLabel,
    periodType: r.periodType,
    periodEnd: r.periodEnd.toISOString(),
    oldStatus: r.processingStatus,
    oldNotes: r.notes,
    valueCount: r.values.length,
  }))
  console.log(JSON.stringify({
    mode: APPLY ? "apply" : "dry-run",
    cutoff: cutoff.toISOString(),
    reports: out.length,
    values: reports.reduce((n, r) => n + r.values.length, 0),
    rows: out,
  }, null, 2))

  if (!APPLY) {
    console.log("No database changes. Re-run with --apply to quarantine these reports.")
    return
  }

  mkdirSync("reports", { recursive: true })
  writeFileSync(ROLLBACK_FILE, JSON.stringify({
    generatedAt: new Date().toISOString(),
    reports: reports.map((r) => ({ reportId: r.id, oldStatus: r.processingStatus, oldNotes: r.notes })),
    values: reports.flatMap((r) => r.values.map((v) => ({
      valueId: v.id, oldStatus: v.validationStatus, oldNotes: v.validationNotes,
    }))),
  }, null, 2), "utf8")

  let valueCount = 0
  for (const r of reports) {
    await db.financialReport.update({
      where: { id: r.id },
      data: { processingStatus: "NEEDS_REVIEW", notes: appendNote(r.notes) },
    })
    for (const v of r.values) {
      if (v.validationStatus === "NEEDS_REVIEW") continue
      await db.financialValue.update({
        where: { id: v.id },
        data: { validationStatus: "NEEDS_REVIEW", validationNotes: appendNote(v.validationNotes) },
      })
      valueCount++
    }
  }
  console.log(JSON.stringify({ quarantinedReports: reports.length, quarantinedValues: valueCount, rollbackFile: ROLLBACK_FILE }, null, 2))
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
