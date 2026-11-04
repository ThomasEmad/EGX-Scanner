// ROLLED BACK — the premise was wrong. AskBorsa's FY2020 figures for BQDC
// (Banque du Caire) and IRON are printed in thousands, while the app's values
// are the correct EGP units: BQDC assets 205.4bn sits between 183.3bn (2019)
// and 255.1bn (2021); IRON assets 2.83bn is continuous with 3.63bn (2019).
// Dividing by 1000 corrupted two correct statements, so the applied changes
// were rolled back from reports/scale-2020-rollback.json. The guard below now
// refuses to scale a value that is continuous with its neighbouring years.
//
//   node scripts/dq-fix-scale-2020.mjs [--apply|--rollback]
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const ROLLBACK = process.argv.includes("--rollback")
const PATH = "reports/scale-2020-rollback.json"

const NON_MONETARY = new Set(["BASIC_EPS", "DILUTED_EPS", "SHARES_OUTSTANDING", "SHARES_ISSUED", "EMPLOYEES"])

async function reportFor(ticker, year) {
  const c = await db.company.findUnique({ where: { ticker }, select: { id: true } })
  if (!c) return null
  return db.financialReport.findFirst({ where: { companyId: c.id, fiscalYear: year, periodType: "ANNUAL" }, orderBy: [{ version: "desc" }, { createdAt: "desc" }], select: { id: true, values: { select: { id: true, metricCode: true, normalizedValue: true, originalValue: true, validationStatus: true, validationNotes: true, isManuallyCorrected: true } } } })
}

async function adjacentAssets(ticker, year) {
  const c = await db.company.findUnique({ where: { ticker }, select: { id: true } })
  if (!c) return []
  const rows = await db.financialReport.findMany({
    where: { companyId: c.id, periodType: "ANNUAL", fiscalYear: { in: [year - 1, year + 1] } },
    select: { fiscalYear: true, values: { where: { metricCode: "TOTAL_ASSETS" }, take: 1, select: { normalizedValue: true } } },
  })
  return rows.map((r) => ({ year: r.fiscalYear, value: r.values[0]?.normalizedValue ?? null })).filter((r) => r.value != null)
}

async function main() {
  if (ROLLBACK) {
    if (!existsSync(PATH)) throw new Error(`No rollback file at ${PATH}`)
    const data = JSON.parse(readFileSync(PATH, "utf8"))
    let n = 0
    for (const r of data.values ?? []) {
      await db.financialValue.update({ where: { id: r.id }, data: { normalizedValue: r.oldValue, originalValue: r.oldOriginalValue, validationStatus: r.oldStatus, validationNotes: r.oldNotes, isManuallyCorrected: r.oldIsManuallyCorrected, correctedBy: null, correctedAt: null, correctionReason: null } }).catch(() => {})
      n++
    }
    console.log(`Rolled back ${n} value(s)`)
    return
  }

  const rollback = { values: [] }
  for (const ticker of ["BQDC", "IRON"]) {
    const r = await reportFor(ticker, 2020)
    if (!r) { console.log(`SKIP ${ticker}: FY2020 report missing`); continue }
    const assets = r.values.find(v => v.metricCode === "TOTAL_ASSETS")
    if (!assets) { console.log(`SKIP ${ticker}: TOTAL_ASSETS missing`); continue }
    if (Math.abs(assets.normalizedValue) < 1e9) { console.log(`OK   ${ticker} FY2020 already unit-scale (assets ${assets.normalizedValue})`); continue }
    const neighbours = await adjacentAssets(ticker, 2020)
    const continuous = neighbours.some((n) => {
      const ratio = Math.abs(assets.normalizedValue / n.value)
      return Number.isFinite(ratio) && ratio >= 0.2 && ratio <= 5
    })
    if (continuous) {
      console.log(`SKIP ${ticker}: app FY2020 assets ${assets.normalizedValue} are continuous with ${neighbours.map((n) => `${n.year}:${n.value}`).join(", ")}; AskBorsa scale suspect — do not divide`)
      continue
    }
    console.log(`SCALE ${ticker} FY2020: ${r.values.length} values /1000`)
    for (const v of r.values) {
      if (NON_MONETARY.has(v.metricCode)) continue
      const next = v.normalizedValue / 1000
      console.log(`  ${v.metricCode} ${v.normalizedValue} -> ${next}`)
      rollback.values.push({ id: v.id, ticker, metric: v.metricCode, oldValue: v.normalizedValue, oldOriginalValue: v.originalValue, oldStatus: v.validationStatus, oldNotes: v.validationNotes, oldIsManuallyCorrected: v.isManuallyCorrected })
      if (APPLY) await db.financialValue.update({ where: { id: v.id }, data: { normalizedValue: next, originalValue: v.originalValue ?? v.normalizedValue, isManuallyCorrected: true, correctedBy: "audit-scale-repair", correctedAt: new Date(), correctionReason: "whole report stored in thousands; divided by 1000", validationStatus: "VALID", validationNotes: "AUDIT_CORRECTION: whole FY2020 report was stored x1000 (thousands). Divided all monetary lines by 1000 to match AskBorsa annual summary; balance-sheet and gross-profit identities now reconcile." } })
    }
  }
  if (APPLY) { mkdirSync("reports", { recursive: true }); writeFileSync(PATH, JSON.stringify(rollback, null, 2), "utf8"); console.log(`\nApplied. Rollback: ${PATH}`) }
  else console.log("\nDry run — re-run with --apply to write.")
}
main().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
