// SIPC FY2024: TOTAL_LIABILITIES was 1.96bn against total assets 169m and
// equity 96.91m. The reported total liabilities & equity (169m) proves the
// split; liabilities must be 72.09m. The three cash-flow legs are also 9-15x
// total assets and cannot belong to this company/period, so they are
// quarantined pending re-extraction from the filing.
//
//   node scripts/dq-fix-sipc-2024.mjs [--apply|--rollback]
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const ROLLBACK = process.argv.includes("--rollback")
const PATH = "reports/sipc-2024-rollback.json"

async function reportFor() {
  const c = await db.company.findUnique({ where: { ticker: "SIPC" }, select: { id: true } })
  return db.financialReport.findFirst({ where: { companyId: c.id, fiscalYear: 2024, periodType: "ANNUAL" }, orderBy: [{ version: "desc" }, { createdAt: "desc" }], select: { id: true } })
}
async function valueOf(reportId, metric) {
  return db.financialValue.findFirst({ where: { reportId, metricCode: metric }, select: { id: true, normalizedValue: true, originalValue: true, validationStatus: true, validationNotes: true, isManuallyCorrected: true } })
}

async function main() {
  if (ROLLBACK) {
    if (!existsSync(PATH)) throw new Error(`No rollback file at ${PATH}`)
    const data = JSON.parse(readFileSync(PATH, "utf8"))
    let n = 0
    for (const c of data.corrections ?? []) {
      await db.financialValue.update({ where: { id: c.id }, data: { normalizedValue: c.oldValue, originalValue: c.oldOriginalValue, validationStatus: c.oldStatus, validationNotes: c.oldNotes, isManuallyCorrected: c.oldIsManuallyCorrected, correctedBy: null, correctedAt: null, correctionReason: null } }).catch(() => {})
      n++
    }
    for (const q of data.quarantines ?? []) {
      await db.financialValue.update({ where: { id: q.id }, data: { validationStatus: q.oldStatus, validationNotes: q.oldNotes } }).catch(() => {})
      n++
    }
    console.log(`Rolled back ${n} change(s)`)
    return
  }

  const r = await reportFor()
  if (!r) throw new Error("SIPC FY2024 report missing")
  const rollback = { corrections: [], quarantines: [] }

  const liab = await valueOf(r.id, "TOTAL_LIABILITIES")
  const newLiab = 72_090_000
  if (Math.abs(liab.normalizedValue - newLiab) < 1) console.log("OK   SIPC FY2024 TOTAL_LIABILITIES already 72.09m")
  else if (Math.abs(liab.normalizedValue - 1_959_808_478) > 1) console.log(`SKIP SIPC FY2024 TOTAL_LIABILITIES current ${liab.normalizedValue}`)
  else {
    console.log("FIX  SIPC FY2024 TOTAL_LIABILITIES 1,959,808,478 -> 72,090,000")
    rollback.corrections.push({ id: liab.id, oldValue: liab.normalizedValue, oldOriginalValue: liab.originalValue, oldStatus: liab.validationStatus, oldNotes: liab.validationNotes, oldIsManuallyCorrected: liab.isManuallyCorrected })
    if (APPLY) await db.financialValue.update({ where: { id: liab.id }, data: { normalizedValue: newLiab, originalValue: liab.originalValue ?? liab.normalizedValue, isManuallyCorrected: true, correctedBy: "audit-bs-repair", correctedAt: new Date(), correctionReason: "TOTAL_ASSETS 169m - TOTAL_EQUITY 96.91m = 72.09m; reported total liabilities & equity is 169m", validationStatus: "VALID", validationNotes: "AUDIT_CORRECTION: liabilities were 1.96bn (11.6x assets). TOTAL_ASSETS 169m - TOTAL_EQUITY 96.91m = 72.09m and the reported total liabilities & equity 169m confirms the split." } })
  }

  const reason = "cash-flow legs (OCF 1.48bn, ICF 2.52bn, FCF 2.36m) are 9-15x total assets 169m and cannot belong to this company/period; re-extract from the filing"
  for (const metric of ["OPERATING_CASH_FLOW", "INVESTING_CASH_FLOW", "FINANCING_CASH_FLOW"]) {
    const v = await valueOf(r.id, metric)
    if (!v) { console.log(`SKIP SIPC FY2024 ${metric}: missing`); continue }
    if (v.validationStatus === "NEEDS_REVIEW" && (v.validationNotes ?? "").includes(reason)) { console.log(`OK   SIPC FY2024 ${metric} already quarantined`); continue }
    console.log(`QUAR SIPC FY2024 ${metric} ${v.normalizedValue}`)
    rollback.quarantines.push({ id: v.id, metric, oldStatus: v.validationStatus, oldNotes: v.validationNotes })
    if (APPLY) await db.financialValue.update({ where: { id: v.id }, data: { validationStatus: "NEEDS_REVIEW", validationNotes: `AUDIT_QUARANTINE: ${reason}` } })
  }

  if (APPLY) { mkdirSync("reports", { recursive: true }); writeFileSync(PATH, JSON.stringify(rollback, null, 2), "utf8"); console.log(`\nApplied. Rollback: ${PATH}`) }
  else console.log("\nDry run — re-run with --apply to write.")
}
main().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
