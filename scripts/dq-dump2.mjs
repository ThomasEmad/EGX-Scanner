import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
async function dump(ticker, label) {
  const co = await db.company.findFirst({ where: { ticker } })
  const r = await db.financialReport.findFirst({
    where: { companyId: co.id, deletedAt: null, periodLabel: label },
    include: { values: { where: { subPeriod: "CURRENT", metricCode: { in: ["TOTAL_ASSETS","TOTAL_LIABILITIES","TOTAL_EQUITY","TOTAL_EQUITY_AND_LIABILITIES","NON_CONTROLLING_INTERESTS","CURRENT_LIABILITIES","NON_CURRENT_LIABILITIES","CURRENT_ASSETS","NON_CURRENT_ASSETS"] } }, select: { metricCode: true, normalizedValue: true, originalLabel: true, validationStatus: true } } },
  })
  console.log(`\n${ticker} ${label} ${r?.sourceName}`)
  for (const v of r.values.sort((a,b)=>a.metricCode.localeCompare(b.metricCode))) console.log("  ", v.metricCode.padEnd(34), Math.round(v.normalizedValue), JSON.stringify(v.originalLabel), v.validationStatus)
}
try { await dump("AALR","FY 2021"); await dump("ALEX","FY 2016"); await dump("ABUK","FY 2022"); await dump("ABUK","FY 2023"); await dump("AMOC","FY 2020") } finally { await db.$disconnect() }
