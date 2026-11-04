import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const tickers = ["NIPH","GSSC","MASR","MFSC","CIRA","GRCA","EDFM","ISMQ","AIDC","CPME","MICH","ECCW"]
for (const ticker of tickers) {
  const c = await db.company.findUnique({ where: { ticker }, select: { id: true, ticker: true, nameEn: true } })
  if (!c) continue
  const reports = await db.financialReport.findMany({
    where: { companyId: c.id, periodType: "ANNUAL" },
    select: { fiscalYear: true, periodLabel: true, periodStart: true, periodEnd: true, processingStatus: true, sourceName: true },
    orderBy: { fiscalYear: "desc" }, take: 6,
  })
  console.log(`${ticker} ${c.nameEn}`)
  for (const r of reports) console.log(`  FY${r.fiscalYear} ${r.periodLabel} start=${r.periodStart?.toISOString().slice(0,10) ?? "-"} end=${r.periodEnd?.toISOString().slice(0,10) ?? "-"} ${r.processingStatus} ${r.sourceName}`)
}
await db.$disconnect()
