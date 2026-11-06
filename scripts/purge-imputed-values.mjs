// Purge imputed/invented FinancialValues so askborsa-sync can fill the slots
// with real, observed data.
//
//   node scripts/purge-imputed-values.mjs            # dry run (counts only)
//   node scripts/purge-imputed-values.mjs --apply    # backup DB + delete + rollback file + audit
//   node scripts/purge-imputed-values.mjs --rollback # restore from rollback JSON
//
// Deletion families (every row is a NON-observation — copied, fabricated or a
// zero placeholder; the platform's integrity-policy.ts already refuses to use
// any of them for calculations, but they still OCCUPY the unique
// (report, metric, subPeriod) slot and block real AskBorsa imports):
//   1. carry-forward copies  : originalLabel "COPIED from …" (non-static metrics)
//   2. fabricated templates  : AUDIT_QUARANTINE: fabricated … (same template
//      value shared across unrelated companies — the ASKBORA_SUMMARY batch)
//   3. annual-copy quarters  : AUDIT_QUARANTINE: annual-copy …
//   4. carried-forward quar. : AUDIT_QUARANTINE: carried-forward …
//   5. cross-quarter dupes   : AUDIT_QUARANTINE: cross-quarter … (harvest
//      tab-switch copies identical to the previous quarter's report)
//   6. zero placeholders     : normalizedValue = 0 for metrics that cannot be
//      zero (TOTAL_ASSETS/LIABILITIES/EQUITY, REVENUE)
//
// KEPT on purpose:
//   • 35 VALID "COPIED from" SHARE_CAPITAL values — static metrics where
//     carrying forward is semantically safe (share counts only change on
//     corporate actions, which are themselves filings).
//   • "Q4 balance sheet copied from annual" values — Q4-end IS the FY-end
//     date, so that value is a real observation, not an invention.
//
// Empty reports left behind after the purge (husks with 0 values) are deleted
// too — each is stored in the same rollback file and can be restored verbatim.
import { PrismaClient } from "@prisma/client"
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs"

const db = new PrismaClient()

const ROLLBACK = "reports/imputed-purge-rollback.json"
const APPLY = process.argv.includes("--apply")
const ROLLBACK_MODE = process.argv.includes("--rollback")

const STATIC_METRICS = ["SHARE_CAPITAL", "SHARES_OUTSTANDING", "TREASURY_SHARES", "PAR_VALUE"]
const NEVER_ZERO = ["TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY", "REVENUE"]
const MARK = "IMPUTED_PURGE:"

const WHERE = {
  OR: [
    { AND: [{ originalLabel: { startsWith: "COPIED from" } }, { metricCode: { notIn: STATIC_METRICS } }] },
    { validationNotes: { contains: "AUDIT_QUARANTINE: fabricated" } },
    { validationNotes: { contains: "AUDIT_QUARANTINE: annual-copy" } },
    { validationNotes: { contains: "AUDIT_QUARANTINE: carried-forward" } },
    { validationNotes: { contains: "AUDIT_QUARANTINE: cross-quarter" } },
    { AND: [{ normalizedValue: 0 }, { metricCode: { in: NEVER_ZERO } }] },
  ],
}

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), "-", ...a)

function ts() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
}

// ---------------------------------------------------------------- rollback
if (ROLLBACK_MODE) {
  if (!existsSync(ROLLBACK)) { console.error(`no rollback file at ${ROLLBACK}`); process.exit(1) }
  const snap = JSON.parse(readFileSync(ROLLBACK, "utf8"))
  if (!snap.applied) { console.error("rollback file is not in applied state"); process.exit(1) }
  log(`rollback: restoring ${snap.reports.length} reports + ${snap.values.length} values from ${snap.backup}`)
  let r = 0
  for (const rep of snap.reports) {
    const { values: _v, ...row } = rep
    await db.financialReport.create({ data: row }).then(() => r++).catch((e) => log(`  report ${rep.id}: ${e.message.slice(0, 80)}`))
  }
  let v = 0
  for (const val of snap.values) {
    const { id, ...row } = val
    await db.financialValue.create({ data: val }).then(() => v++).catch((e) => log(`  value ${id}: ${e.message.slice(0, 80)}`))
  }
  log(`restored reports=${r}/${snap.reports.length} values=${v}/${snap.values.length}`)
  process.exit(0)
}

// ------------------------------------------------------------------ dry run
if (!APPLY) {
  const fams = [
    ["carry-forward copies (COPIED from*, non-static)", { AND: [{ originalLabel: { startsWith: "COPIED from" } }, { metricCode: { notIn: STATIC_METRICS } }] }],
    ["fabricated template values", { validationNotes: { contains: "AUDIT_QUARANTINE: fabricated" } }],
    ["annual-copy quarters", { validationNotes: { contains: "AUDIT_QUARANTINE: annual-copy" } }],
    ["carried-forward quarantines", { validationNotes: { contains: "AUDIT_QUARANTINE: carried-forward" } }],
    ["cross-quarter duplicates", { validationNotes: { contains: "AUDIT_QUARANTINE: cross-quarter" } }],
    ["zero placeholders (never-zero metrics)", { AND: [{ normalizedValue: 0 }, { metricCode: { in: NEVER_ZERO } }] }],
  ]
  for (const [name, w] of fams) log(String(await db.financialValue.count({ where: w })).padStart(6), name)
  const total = await db.financialValue.count({ where: WHERE })
  log("========", "UNIQUE deletion set:", total)
  log(`kept by design: ${await db.financialValue.count({ where: { AND: [{ originalLabel: { startsWith: "COPIED from" } }, { metricCode: { in: STATIC_METRICS } }] } })} static-metric carry-forwards (SHARE_CAPITAL …)`)
  log("dry run — nothing deleted. Re-run with --apply to execute.")
  process.exit(0)
}

// -------------------------------------------------------------------- apply
log("backup DB …")
const backup = `backups/pre-imputed-purge-${ts()}.db`
cpSync("db/custom.db", backup)
log(`backup written: ${backup}`)

log("loading deletion set …")
const values = await db.financialValue.findMany({ where: WHERE })
log(`deletion set: ${values.length} values across ${new Set(values.map((v) => v.reportId)).size} reports`)

// safety: never delete anything that is currently authoritative
const bad = values.filter((v) => v.validationStatus === "VALID" && !v.validationNotes?.includes("AUDIT_QUARANTINE") && !v.originalLabel.startsWith("COPIED from") && v.normalizedValue !== 0)
if (bad.length) {
  console.error(`ABORT: ${bad.length} deletion-set rows look authoritative but matched the filter — inspect before applying.`)
  for (const b of bad.slice(0, 5)) console.error("  ", b.id, b.metricCode, b.originalLabel, b.validationNotes?.slice(0, 60))
  process.exit(1)
}

const valRows = values.map((v) => ({ ...v, _meta: undefined }))
writeFileSync(ROLLBACK, JSON.stringify({ applied: false, appliedAt: null, backup, values: valRows, reports: [] }, null, 0), "utf8")
log(`rollback file prepared: ${ROLLBACK}`)

log("deleting values …")
const ids = values.map((v) => v.id)
let deleted = 0
const CHUNK = 500
for (let i = 0; i < ids.length; i += CHUNK) {
  const r = await db.financialValue.deleteMany({ where: { id: { in: ids.slice(i, i + CHUNK) } } })
  deleted += r.count
}
log(`deleted values: ${deleted}/${values.length}`)

// husk reports (0 values left) among the affected reports
log("finding empty husk reports …")
const affected = [...new Set(values.map((v) => v.reportId))]
const remaining = await db.financialValue.groupBy({ by: ["reportId"], where: { reportId: { in: affected } }, _count: { _all: true } })
const withVals = new Set(remaining.map((r) => r.reportId))
const huskIds = affected.filter((id) => !withVals.has(id))
const husks = huskIds.length ? await db.financialReport.findMany({ where: { id: { in: huskIds } } }) : []
log(`husk reports to delete: ${husks.length}`)

// save final rollback (values + husk reports) BEFORE deleting reports
writeFileSync(ROLLBACK, JSON.stringify({ applied: false, appliedAt: null, backup, values: valRows, reports: husks }, null, 0), "utf8")

if (husks.length) {
  for (const t of ["financialValidationResult", "financialExtractionLog"]) {
    try {
      const res = await db[t].deleteMany({ where: { reportId: { in: huskIds } } })
      if (res.count) log(`  cleaned ${res.count} ${t} rows from husks`)
    } catch { /* table/model may not expose reportId — cascade handles it */ }
  }
  const r = await db.financialReport.deleteMany({ where: { id: { in: huskIds } } })
  log(`deleted husk reports: ${r.count}/${husks.length}`)
}

// mark rollback file as applied
writeFileSync(ROLLBACK, JSON.stringify({ applied: true, appliedAt: new Date().toISOString(), backup, values: valRows, reports: husks }, null, 0), "utf8")

await db.auditLog.create({
  data: {
    actor: "purge-imputed-values",
    action: "VALIDATE",
    entityType: "FinancialValue",
    details: `${MARK} purged ${deleted} imputed/non-observed values (carry-forward copies, fabricated templates, annual-copy quarters, cross-quarter duplicates, zero placeholders) + ${husks.length} empty husk reports. Backup: ${backup}. Rollback file: ${ROLLBACK}. Purpose: free slots for askborsa-sync re-import of observed data.`,
  },
})
log(`audit log written. DONE — now run: node scripts/askborsa-sync.mjs --apply --recompute`)
process.exit(0)
