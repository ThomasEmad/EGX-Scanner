import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const subs = await db.financialValue.groupBy({ by: ["subPeriod"], _count: { _all: true } })
  console.log("subPeriod distribution:", subs)
  const aalr = await db.company.findFirst({ where: { ticker: "AALR" } })
  const reps = await db.financialReport.findMany({
    where: { companyId: aalr.id, deletedAt: null, periodLabel: "Q4 2023" },
    include: { values: { where: { metricCode: { in: ["GROSS_PROFIT", "NET_PROFIT", "OPERATING_CASH_FLOW"] } }, select: { metricCode: true, normalizedValue: true, subPeriod: true, statementType: true, validationStatus: true } } },
  })
  for (const r of reps) {
    console.log(`report ${r.id} ${r.statementType}/${r.sourceName}/v${r.version} ${r.periodLabel}`)
    for (const v of r.values) console.log("   ", v.metricCode, v.subPeriod, v.statementType, v.normalizedValue)
  }
  // how many reports have >1 value for same metric with different subPeriod?
  const dup = await db.$queryRaw`SELECT COUNT(*) as n FROM (SELECT reportId, metricCode, COUNT(*) c FROM FinancialValue GROUP BY reportId, metricCode HAVING c > 1)`
  console.log("report+metric with multiple subPeriod rows:", dup)
} finally { await db.$disconnect() }
