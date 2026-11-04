import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const want = [["SIPC",2024,"ANNUAL"],["UNIT",2022,"ANNUAL"],["OFH",2024,"ANNUAL"],["EGAS",2022,"ANNUAL"]]
try {
  for (const [ticker, year, period] of want) {
    const c = await db.company.findUnique({ where: { ticker }, select: { id: true, nameEn: true } })
    const r = await db.financialReport.findFirst({ where: { companyId: c.id, fiscalYear: year, periodType: period }, orderBy: [{ version: "desc" }, { createdAt: "desc" }], select: { id: true, sourceName: true, version: true, values: { where: { metricCode: { in: ["TOTAL_ASSETS","TOTAL_LIABILITIES","TOTAL_EQUITY","TOTAL_EQUITY_AND_LIABILITIES","NON_CONTROLLING_INTERESTS","CURRENT_LIABILITIES","NON_CURRENT_LIABILITIES","PROFIT_BEFORE_TAX","INCOME_TAX","NET_PROFIT","NET_PROFIT_PARENT","OPERATING_CASH_FLOW","INVESTING_CASH_FLOW","FINANCING_CASH_FLOW","NET_CASH_CHANGE","CASH_OPENING","CASH_CLOSING","FX_EFFECT"] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true, validationNotes: true, sourceText: true } } } })
    console.log(`\n=== ${ticker} ${year} ${c.nameEn} ${r?.sourceName} v${r?.version} ===`)
    for (const v of r.values.sort((a,b)=>a.metricCode.localeCompare(b.metricCode))) console.log(`  ${v.metricCode} ${v.normalizedValue} ${v.validationStatus} ${(v.validationNotes??"").slice(0,110)}`)
  }
} finally { await db.$disconnect() }
