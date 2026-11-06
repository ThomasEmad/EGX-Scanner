import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const co = await db.company.findFirst({ where: { ticker: "FWRY" } })
  const reps = await db.financialReport.findMany({
    where: { companyId: co.id, periodLabel: { in: ["FY 2022", "FY 2023", "FY 2025", "Q2 2026"] } },
    select: { periodLabel: true, values: { where: { metricCode: { in: ["PROFIT_BEFORE_TAX", "INCOME_TAX", "NET_PROFIT", "NON_CONTROLLING_INTERESTS", "NET_PROFIT_PARENT", "REVENUE"] }, subPeriod: "CURRENT" }, select: { metricCode: true, normalizedValue: true, originalLabel: true } } },
  })
  for (const r of reps) {
    console.log(`\nFWRY ${r.periodLabel}`)
    for (const v of r.values) console.log("  ", v.metricCode.padEnd(28), Math.round(v.normalizedValue).toLocaleString(), JSON.stringify(v.originalLabel).slice(0, 70))
  }
} finally { await db.$disconnect() }
