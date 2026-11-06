import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const rows = await db.financialValue.findMany({
    where: { company: { ticker: "FWRY" }, report: { periodLabel: "FY 2018" }, metricCode: { in: ["TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY", "TOTAL_EQUITY_AND_LIABILITIES", "CURRENT_ASSETS", "NON_CURRENT_ASSETS", "REVENUE", "COGS", "GROSS_PROFIT"] } },
    select: { metricCode: true, subPeriod: true, normalizedValue: true, validationStatus: true, originalLabel: true },
    orderBy: [{ subPeriod: "asc" }, { metricCode: "asc" }],
  })
  for (const r of rows) console.log(r.subPeriod?.padEnd(8), r.metricCode.padEnd(32), r.normalizedValue.toExponential(3), r.validationStatus, JSON.stringify(r.originalLabel).slice(0, 50))
} finally { await db.$disconnect() }
