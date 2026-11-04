import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  for (const ticker of ["ALEX","GTHE","UASG","OFH"]) {
    const c = await db.company.findFirst({ where: { ticker }, select: { id: true, nameEn: true } })
    const reports = await db.financialReport.findMany({ where: { companyId: c.id, periodType: "ANNUAL" }, orderBy: [{ fiscalYear: "desc" }], take: 3, select: { fiscalYear: true, periodLabel: true, statementType: true, sourceName: true, values: { where: { metricCode: { in: ["NET_PROFIT","TOTAL_ASSETS","TOTAL_EQUITY"] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true, validationNotes: true } } } })
    console.log(`\n=== ${ticker} | ${c.nameEn} ===`)
    for (const r of reports) { console.log(`${r.fiscalYear} ${r.periodLabel} ${r.statementType} ${r.sourceName}`); for (const v of r.values) console.log(`  ${v.metricCode} ${v.normalizedValue} ${v.validationStatus} ${(v.validationNotes??"").slice(0,100)}`) }
  }
} finally { await db.$disconnect() }
