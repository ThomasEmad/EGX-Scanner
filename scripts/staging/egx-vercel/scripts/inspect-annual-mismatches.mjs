import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const tickers = ["ELKA","MHOT","GRCA","GSSC","UNIT","SIPC","EAST","HELI","CANA","COPR","EGAS","DAPH","OFH","ASPI","ATLC","ACRO","AIFI","AALR","ALEX","SCFM","PRCL","UASG","GTHE","BQDC","IRON"]
try {
  for (const ticker of tickers) {
    const c = await db.company.findFirst({ where: { ticker }, select: { id: true, nameEn: true } })
    if (!c) { console.log(`\n=== ${ticker} MISSING ===`); continue }
    const reports = await db.financialReport.findMany({
      where: { companyId: c.id, periodType: "ANNUAL", fiscalYear: { gte: 2023 } },
      orderBy: [{ fiscalYear: "desc" }],
      select: { fiscalYear: true, periodLabel: true, statementType: true, sourceName: true, values: { where: { metricCode: { in: ["NET_PROFIT","NET_PROFIT_PARENT","TOTAL_ASSETS","TOTAL_EQUITY","EQUITY_PARENT"] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true, validationNotes: true, originalLabel: true } } },
    })
    console.log(`\n=== ${ticker} | ${c.nameEn} ===`)
    for (const r of reports) {
      console.log(`${r.fiscalYear} ${r.periodLabel} ${r.statementType} ${r.sourceName}`)
      for (const v of r.values) console.log(`  ${v.metricCode} ${v.normalizedValue} ${v.validationStatus} ${v.originalLabel ?? ""} ${(v.validationNotes ?? "").slice(0,140)}`)
    }
  }
} finally { await db.$disconnect() }
