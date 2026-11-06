// quick conventions check: sign/unit for income-statement metrics + registry codes
import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const c = await db.company.findUnique({ where: { ticker: "ABUK" } })
const r = await db.financialReport.findFirst({
  where: { companyId: c.id, periodLabel: "FY 2025" },
  include: { values: { where: { metricCode: { in: ["COGS", "INCOME_TAX", "REVENUE", "OPERATING_EXPENSES_TOTAL", "BASIC_EPS", "NET_PROFIT", "NET_PROFIT_PARENT", "OPERATING_INCOME", "GROSS_PROFIT", "TOTAL_DEBT"] } } } },
})
for (const v of r.values) console.log(v.metricCode.padEnd(24), String(v.value).padStart(18), "unit=" + v.unit.padEnd(9), "norm=" + v.normalizedValue, "| " + v.originalLabel)
console.log("report:", JSON.stringify({ sourceName: r.sourceName, extractionMethod: r.extractionMethod, processingStatus: r.processingStatus, parserVersion: r.parserVersion }))
const mdefs = await db.metricDefinition.findMany({ where: { isActive: true }, select: { code: true, statementType: true }, orderBy: { code: "asc" } })
console.log("--- registry", mdefs.length, "active codes ---")
console.log(mdefs.map(m => m.code).join(","))
await db.$disconnect()
