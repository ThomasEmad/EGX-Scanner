import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  for (const t of ["ARCC","MCQE","MPCI","AXPH","HDBK"]) {
    const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true, nameEn: true } })
    console.log(`\n=== ${t} | ${c.nameEn} ===`)
    const reports = await db.financialReport.findMany({ where: { companyId: c.id, periodType: "ANNUAL", fiscalYear: { gte: 2024 } }, orderBy: { fiscalYear: "desc" }, select: { fiscalYear: true, periodLabel: true, statementType: true, sourceName: true, values: { where: { metricCode: { in: ["NET_PROFIT","NET_PROFIT_PARENT","TOTAL_ASSETS","TOTAL_EQUITY","REVENUE","GROSS_PROFIT","PROFIT_BEFORE_TAX","INCOME_TAX","NON_CONTROLLING_INTERESTS"] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true, originalLabel: true, validationNotes: true } } } })
    for (const r of reports) { console.log(`${r.fiscalYear} ${r.periodLabel} ${r.statementType} ${r.sourceName}`); for (const v of r.values) console.log(`  ${v.metricCode} ${v.normalizedValue} ${v.validationStatus} ${v.originalLabel ?? ""} ${(v.validationNotes??"").slice(0,80)}`) }
  }
} finally { await db.$disconnect() }
