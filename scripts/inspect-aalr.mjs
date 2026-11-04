import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const ticker = process.argv[2] ?? "AALR"
const company = await db.company.findUnique({ where: { ticker } })
if (!company) throw new Error(`company not found: ${ticker}`)

const values = await db.financialValue.findMany({
  where: { companyId: company.id, metricCode: { in: ["REVENUE", "NET_PROFIT", "TOTAL_ASSETS", "TOTAL_EQUITY"] } },
  include: { report: { select: { periodLabel: true, periodType: true, statementType: true, processingStatus: true } } },
  orderBy: [{ report: { periodEnd: "desc" } }, { metricCode: "asc" }],
  take: 60,
})
const metrics = await db.calculatedMetric.findMany({
  where: { companyId: company.id, code: { in: ["revenue", "net_profit", "roe", "total_assets"] } },
  orderBy: [{ periodKey: "desc" }, { code: "asc" }],
  take: 80,
})
console.log(JSON.stringify({ ticker, company: { id: company.id, sector: company.sector }, values, metrics }, null, 2))
await db.$disconnect()
