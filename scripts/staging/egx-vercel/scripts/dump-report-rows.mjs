// Check raw rows (all subPeriods) for a ticker+label to understand provenance fields.
import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const ticker = process.argv[2] ?? "ABUK"
const label = process.argv[3] ?? "Q1 2026"

const c = await db.company.findFirst({ where: { ticker: ticker.toUpperCase() }, select: { id: true } })
const r = await db.financialReport.findFirst({
  where: { companyId: c.id, periodLabel: label, deletedAt: null, isDemoData: false, statementType: "CONSOLIDATED" },
  select: { id: true, periodLabel: true, periodType: true, values: { select: { metricCode: true, value: true, normalizedValue: true, subPeriod: true, extractionMethod: true, validationStatus: true, validationNotes: true, confidence: true, createdAt: true } } },
})
if (!r) { console.log("not found"); process.exit(0) }
console.log(`report ${r.id} ${r.periodLabel} (${r.periodType})`)
for (const v of r.values.sort((a, b) => a.metricCode.localeCompare(b.metricCode))) {
  console.log(`  ${v.metricCode.padEnd(32)} value=${v.value} norm=${v.normalizedValue} sub=${v.subPeriod} ext=${v.extractionMethod} st=${v.validationStatus} conf=${v.confidence} at=${v.createdAt?.toISOString?.().slice(0, 16)}`)
  console.log(`     notes: ${v.validationNotes}`)
}
await db.$disconnect()
