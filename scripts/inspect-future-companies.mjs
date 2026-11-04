import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const tickers = ["NIPH","GSSC","MASR","MFSC","CIRA","GRCA","EDFM","ISMQ","AIDC","CPME","MICH","ECCW"]
for (const ticker of tickers) {
  const c = await db.company.findUnique({ where: { ticker }, select: { id: true, ticker: true, nameEn: true, sector: true } })
  if (!c) continue
  const reports = await db.financialReport.findMany({
    where: { companyId: c.id, periodType: { in: ["ANNUAL","QUARTERLY","SEMIANNUAL","NINE_MONTH"] } },
    select: { id: true, periodLabel: true, periodType: true, fiscalYear: true, periodStart: true, periodEnd: true, processingStatus: true, sourceName: true, sourceUrl: true, notes: true, createdAt: true },
    orderBy: [{ periodEnd: "desc" }], take: 12,
  })
  console.log(JSON.stringify({ company: c, reports }, null, 2))
}
await db.$disconnect()
