/**
 * Apply the data-integrity policy to the FinancialValue table.
 *
 *   node scripts/dq-apply-integrity.mjs           # dry run (default)
 *   node scripts/dq-apply-integrity.mjs --apply   # write changes
 *
 * Three reversible actions:
 *   1. quarantine carried-forward copies (quarterly balance sheets copied
 *      from a previous filing — not observed in the new filing)
 *   2. quarantine zero placeholders for metrics that cannot be zero
 *   3. re-map provably mis-labelled metrics (Net Debt, Invested Capital,
 *      Total Capitalization) to their correct canonical codes
 *
 * Nothing is deleted. Every change records who/why and can be reverted.
 */
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")

const STATIC_METRICS = ["SHARE_CAPITAL", "SHARES_OUTSTANDING", "TREASURY_SHARES", "PAR_VALUE"]
const NEVER_ZERO = ["TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY", "REVENUE"]
const QUARANTINE = "AUDIT_QUARANTINE:"
const ACTOR = "integrity-policy-v1"

const REMAPS = [
  { from: "TOTAL_DEBT", label: "Net Debt", to: "NET_DEBT", why: 'original label "Net Debt" is debt minus cash, not gross total debt' },
  { from: "INVESTMENTS", label: "Invested Capital", to: "INVESTED_CAPITAL", why: '"Invested Capital" is debt + equity, not the investments balance' },
  { from: "SHARE_CAPITAL", label: "Total Capitalization", to: "TOTAL_CAPITALIZATION", why: '"Total Capitalization" is debt + equity, not share capital' },
]

const NEW_METRICS = [
  { code: "NET_DEBT", labelEn: "Net Debt", labelAr: "صافي الدين", statementType: "BALANCE_SHEET", description: "Interest-bearing debt minus cash — NOT gross total debt", aliases: ["net debt", "صافي الدين"], group: "balance.liabilities", displayOrder: 210 },
  { code: "INVESTED_CAPITAL", labelEn: "Invested Capital", labelAr: "رأس المال المستثمر", statementType: "BALANCE_SHEET", description: "Debt + equity invested in the business — NOT the investments balance", aliases: ["invested capital", "رأس المال المستثمر"], group: "balance.equity", displayOrder: 211 },
  { code: "TOTAL_CAPITALIZATION", labelEn: "Total Capitalization", labelAr: "إجمالي الرسملة", statementType: "BALANCE_SHEET", description: "Debt + equity — NOT share capital", aliases: ["total capitalization", "إجمالي الرسملة"], group: "balance.equity", displayOrder: 212 },
]

const notQuarantined = {
  OR: [
    { validationNotes: null },
    { validationNotes: { not: { startsWith: QUARANTINE } } },
  ],
}

async function main() {
  console.log(`\n=== Integrity policy ${APPLY ? "APPLY" : "DRY RUN"} ===\n`)

  // 1) carried-forward copies
  const copiedWhere = {
    originalLabel: { startsWith: "COPIED from" },
    validationStatus: { not: "FAILED" },
    metricCode: { notIn: STATIC_METRICS },
    ...notQuarantined,
  }
  const copied = await db.financialValue.count({ where: copiedWhere })
  console.log(`carried-forward copies to quarantine: ${copied}`)

  // 2) zero placeholders
  const zeroWhere = {
    normalizedValue: 0,
    metricCode: { in: NEVER_ZERO },
    validationStatus: { not: "FAILED" },
    ...notQuarantined,
  }
  const zero = await db.financialValue.count({ where: zeroWhere })
  console.log(`zero placeholders to quarantine:        ${zero}`)

  // 3) mis-mapped metrics
  const remapPlan = []
  for (const r of REMAPS) {
    const rows = await db.financialValue.findMany({
      where: { metricCode: r.from, originalLabel: r.label, validationStatus: { not: "FAILED" } },
      select: { id: true, company: { select: { ticker: true } }, report: { select: { periodLabel: true } }, normalizedValue: true },
    })
    remapPlan.push({ ...r, rows })
    console.log(`re-map ${r.from} → ${r.to}: ${rows.length}`)
  }

  if (!APPLY) {
    console.log("\nDry run — no changes written. Re-run with --apply.")
    return
  }

  if (copied > 0) {
    const res = await db.financialValue.updateMany({
      where: copiedWhere,
      data: {
        validationStatus: "NEEDS_REVIEW",
        validationNotes: `${QUARANTINE} carried-forward copy from another period — not observed in this filing`,
        correctedBy: ACTOR,
        correctedAt: new Date(),
        correctionReason: "carried-forward value is not an observed actual for this period",
      },
    })
    console.log(`quarantined copies: ${res.count}`)
  }

  if (zero > 0) {
    const res = await db.financialValue.updateMany({
      where: zeroWhere,
      data: {
        validationStatus: "NEEDS_REVIEW",
        validationNotes: `${QUARANTINE} zero placeholder for a metric that cannot be zero — treated as missing`,
        correctedBy: ACTOR,
        correctedAt: new Date(),
        correctionReason: "zero placeholder is not a real observation",
      },
    })
    console.log(`quarantined zeros: ${res.count}`)
  }

  for (const plan of remapPlan) {
    let changed = 0
    for (const row of plan.rows) {
      await db.financialValue.update({
        where: { id: row.id },
        data: {
          metricCode: plan.to,
          correctedBy: ACTOR,
          correctedAt: new Date(),
          correctionReason: `AUDIT_REMAP: ${plan.why}`,
          validationNotes: `AUDIT_REMAP: ${plan.why}`,
        },
      })
      changed++
    }
    console.log(`re-mapped ${plan.from} → ${plan.to}: ${changed}`)
  }

  for (const m of NEW_METRICS) {
    await db.metricDefinition.upsert({
      where: { code: m.code },
      update: { labelEn: m.labelEn, labelAr: m.labelAr, statementType: m.statementType, description: m.description, aliases: JSON.stringify(m.aliases), group: m.group, displayOrder: m.displayOrder, isActive: true },
      create: { code: m.code, labelEn: m.labelEn, labelAr: m.labelAr, statementType: m.statementType, description: m.description, aliases: JSON.stringify(m.aliases), group: m.group, displayOrder: m.displayOrder, isActive: true, calcRole: "INPUT" },
    })
  }
  console.log(`metric definitions ensured: ${NEW_METRICS.map(m => m.code).join(", ")}`)
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
