import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const ticker = process.argv[2] ?? "AALR"
const company = await db.company.findUnique({ where: { ticker } })
if (!company) throw new Error(`company not found: ${ticker}`)
const reports = await db.financialReport.findMany({
  where: { companyId: company.id },
  select: { id: true, periodLabel: true, periodType: true, fiscalYear: true, statementType: true, processingStatus: true, sourceName: true, parserVersion: true },
  orderBy: [{ periodEnd: "desc" }],
})
const ids = reports.map((r) => r.id)
const values = await db.financialValue.findMany({
  where: { reportId: { in: ids }, metricCode: { in: ["REVENUE", "NET_PROFIT", "NET_PROFIT_PARENT", "TOTAL_ASSETS", "TOTAL_EQUITY", "EQUITY_PARENT"] } },
  select: { reportId: true, metricCode: true, originalLabel: true, value: true, unit: true, normalizedValue: true, validationStatus: true, validationNotes: true, subPeriod: true, statementType: true },
})
const byReport = new Map(reports.map((r) => [r.id, r]))
const rows = values.map((v) => ({ ...v, report: byReport.get(v.reportId) }))
rows.sort((a, b) => (b.report?.periodLabel ?? "").localeCompare(a.report?.periodLabel ?? ""))
console.log(JSON.stringify({ ticker, reports, rows }, null, 2))
await db.$disconnect()
