import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const reps = await db.financialReport.findMany({
    where: { company: { ticker: "FWRY" }, periodLabel: "FY 2018" },
    select: { id: true, sourceName: true, statementType: true, periodType: true, values: { where: { metricCode: { in: ["TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY", "CURRENT_ASSETS", "NON_CURRENT_ASSETS"] } }, select: { metricCode: true, subPeriod: true, normalizedValue: true, validationStatus: true } } },
  })
  for (const r of reps) {
    console.log(`\n${r.id} ${r.sourceName} ${r.statementType} ${r.periodType}`)
    for (const v of r.values) console.log("  ", v.metricCode.padEnd(24), v.subPeriod, v.normalizedValue, v.validationStatus)
  }
} finally { await db.$disconnect() }
