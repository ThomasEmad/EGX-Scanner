import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const tickers = ["MASR","MFSC","GRCA","EDFM","ISMQ","AIDC","CPME","ECCW"]
const codes = ["NET_PROFIT","REVENUE","TOTAL_ASSETS","TOTAL_EQUITY","NET_PROFIT_PARENT"]
for (const ticker of tickers) {
  const c = await db.company.findUnique({ where: { ticker }, select: { id: true, ticker: true, nameEn: true, sector: true } })
  if (!c) continue
  const reports = await db.financialReport.findMany({
    where: { companyId: c.id, periodType: { in: ["ANNUAL","NINE_MONTH","LATEST"] }, fiscalYear: { gte: 2024 } },
    select: { id: true, periodLabel: true, periodType: true, fiscalYear: true, periodStart: true, periodEnd: true, processingStatus: true, sourceName: true, sourceUrl: true, notes: true, values: { where: { metricCode: { in: codes } }, select: { metricCode: true, normalizedValue: true, validationStatus: true, subPeriod: true } } },
    orderBy: { fiscalYear: "desc" },
  })
  console.log(JSON.stringify({ company: c, reports }, null, 2))
}
await db.$disconnect()
