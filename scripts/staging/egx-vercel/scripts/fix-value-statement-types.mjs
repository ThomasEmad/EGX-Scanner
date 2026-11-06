// Repair FinancialValue.statementType.
//
// The field must hold the statement kind (INCOME_STATEMENT | BALANCE_SHEET |
// CASH_FLOW | OTHER) because the financials API groups rows by it. Several
// importers stored the consolidation basis ("CONSOLIDATED"/"STANDALONE")
// instead, which made otherwise-valid values invisible in the UI.
//
//   node scripts/fix-value-statement-types.mjs            # dry run
//   node scripts/fix-value-statement-types.mjs --apply    # write + rollback
//   node scripts/fix-value-statement-types.mjs --rollback # undo
//
// The target value comes from MetricDefinition.statementType (the canonical
// registry), never from a guess. Values, labels and validation status are not
// touched.
import { PrismaClient } from "@prisma/client"
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"

const db = new PrismaClient()
const ROLLBACK = "reports/value-statement-type-rollback.json"
const PLAN = "reports/value-statement-type-plan.json"
const APPLY = process.argv.includes("--apply")
const ROLLBACK_MODE = process.argv.includes("--rollback")
const VALID_KINDS = ["INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW", "OTHER"]

async function runRollback() {
  if (!existsSync(ROLLBACK)) {
    console.error(`No rollback file at ${ROLLBACK}`)
    process.exit(1)
  }
  const data = JSON.parse(readFileSync(ROLLBACK, "utf8"))
  let updated = 0
  for (const group of data.groups ?? []) {
    const res = await db.financialValue.updateMany({
      where: { id: { in: group.ids } },
      data: { statementType: group.from },
    })
    updated += res.count
  }
  console.log(`rollback complete: ${updated} values restored`)
}

async function main() {
  if (ROLLBACK_MODE) return runRollback()

  const defs = await db.metricDefinition.findMany({ select: { code: true, statementType: true } })
  const target = new Map(defs.map((d) => [d.code, d.statementType]))
  const bad = await db.financialValue.findMany({
    where: { statementType: { notIn: VALID_KINDS } },
    select: { id: true, metricCode: true, statementType: true, extractionMethod: true },
  })

  const groups = new Map()
  const byMethod = {}
  for (const v of bad) {
    const to = target.get(v.metricCode)
    if (!to) continue
    const key = `${v.statementType}|${to}`
    if (!groups.has(key)) groups.set(key, { from: v.statementType, to, ids: [], codes: new Set(), methods: {} })
    groups.get(key).ids.push(v.id)
    groups.get(key).codes.add(v.metricCode)
    groups.get(key).methods[v.extractionMethod] = (groups.get(key).methods[v.extractionMethod] ?? 0) + 1
    byMethod[v.extractionMethod] = (byMethod[v.extractionMethod] ?? 0) + 1
  }

  console.log(`mode: ${APPLY ? "APPLY" : "DRY RUN"}`)
  console.log(`values to relabel: ${bad.length}`)
  console.log(`by extraction method: ${JSON.stringify(byMethod)}`)
  for (const [key, g] of groups) console.log(`  ${key}: ${g.ids.length} ${JSON.stringify(g.methods)}`)

  if (!APPLY) {
    mkdirSync("reports", { recursive: true })
    writeFileSync(PLAN, JSON.stringify({ generatedAt: new Date().toISOString(), groups: [...groups.values()] }, null, 2), "utf8")
    console.log(`dry run: wrote ${PLAN}`)
    return
  }

  const rollback = { generatedAt: new Date().toISOString(), groups: [] }
  let updated = 0
  for (const g of groups.values()) {
    const res = await db.financialValue.updateMany({
      where: { id: { in: g.ids }, metricCode: { in: [...g.codes] } },
      data: { statementType: g.to },
    })
    updated += res.count
    rollback.groups.push({ from: g.from, to: g.to, ids: g.ids })
  }
  mkdirSync("reports", { recursive: true })
  writeFileSync(ROLLBACK, JSON.stringify(rollback, null, 2), "utf8")
  await db.auditLog.create({
    data: {
      actor: "system",
      action: "UPDATE",
      entityType: "FinancialValue",
      details: `Statement-kind relabel: ${updated} values; CONSOLIDATED/STANDALONE were hiding valid rows from the financials API; rollback ${ROLLBACK}`,
    },
  })
  console.log(`updated: ${updated}`)
  console.log(`rollback: ${ROLLBACK}`)
}

main()
  .catch((e) => { console.error("STATEMENT-TYPE FIX FAILED:", e); process.exitCode = 1 })
  .finally(async () => { await db.$disconnect() })
