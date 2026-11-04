import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const big = await db.financialValue.findMany({
    where: { metricCode: "TOTAL_ASSETS", validationStatus: "VALID", normalizedValue: { gt: 1e12 } },
    select: { normalizedValue: true, value: true, unit: true, originalLabel: true, report: { select: { periodLabel: true, company: { select: { ticker: true } } } } },
    orderBy: { normalizedValue: "desc" },
    take: 20,
  })
  console.log("TOTAL_ASSETS > 1e12:", big.length)
  for (const b of big) console.log(b.report.company.ticker, b.report.periodLabel, b.value, b.unit, "→", b.normalizedValue, JSON.stringify(b.originalLabel).slice(0, 60))

  const fwry = await db.company.findFirst({ where: { ticker: "FWRY" } })
  const reps = await db.financialReport.findMany({
    where: { companyId: fwry.id, deletedAt: null, fiscalYear: { gte: 2021, lte: 2023 } },
    select: { periodLabel: true, sourceName: true, values: { where: { metricCode: { in: ["TOTAL_ASSETS", "REVENUE", "TOTAL_EQUITY", "NET_PROFIT"] }, subPeriod: "CURRENT" }, select: { metricCode: true, value: true, unit: true, normalizedValue: true, originalLabel: true, validationStatus: true } } },
  })
  for (const r of reps) {
    console.log(`\nFWRY ${r.periodLabel} ${r.sourceName}`)
    for (const v of r.values) console.log("  ", v.metricCode.padEnd(14), v.value, v.unit, "→", v.normalizedValue, v.validationStatus, JSON.stringify(v.originalLabel).slice(0, 50))
  }
} finally { await db.$disconnect() }
