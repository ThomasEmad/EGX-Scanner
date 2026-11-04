import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  for (const t of ["MPCI","AXPH"]) {
    const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true, nameEn: true, sector: true } })
    console.log(`\n=== ${t} ${c.nameEn} ${c.sector} ${c.id} ===`)
    const reports = await db.financialReport.findMany({ where: { companyId: c.id, periodType: { in: ["ANNUAL","TTM"] } }, orderBy: [{ fiscalYear: "desc" }, { periodType: "asc" }], select: { id: true, fiscalYear: true, periodType: true, periodLabel: true, periodStart: true, periodEnd: true, statementType: true, sourceName: true, processingStatus: true, version: true, values: { where: { metricCode: { in: ["NET_PROFIT","NET_PROFIT_PARENT","TOTAL_ASSETS","TOTAL_EQUITY","TOTAL_LIABILITIES","REVENUE","GROSS_PROFIT","PROFIT_BEFORE_TAX","INCOME_TAX"] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true, sourceText: true } } } })
    for (const r of reports) {
      console.log(`${r.fiscalYear} ${r.periodType} ${r.periodLabel} end=${r.periodEnd?.toISOString().slice(0,10)} ${r.statementType} ${r.sourceName} v${r.version} ${r.processingStatus} id=${r.id}`)
      for (const v of r.values) console.log(`   ${v.metricCode} ${v.normalizedValue} ${v.validationStatus} ${(v.sourceText??"").slice(0,80)}`)
    }
  }
} finally { await db.$disconnect() }
