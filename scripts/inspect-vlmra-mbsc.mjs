import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  for (const ticker of ["VLMRA","MBSC","MPCI","ALCN","CSAG"]) {
    const c = await db.company.findFirst({ where: { ticker }, select: { id: true, nameEn: true } })
    const reports = await db.financialReport.findMany({ where: { companyId: c.id, fiscalYear: { gte: 2025 } }, orderBy: [{ fiscalYear: "desc" }, { periodLabel: "desc" }], select: { fiscalYear: true, periodLabel: true, periodType: true, sourceName: true, values: { where: { metricCode: { in: ["NET_PROFIT","NET_PROFIT_PARENT","TOTAL_EQUITY","REVENUE"] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true, originalLabel: true, validationNotes: true } } } })
    console.log(`\n=== ${ticker} | ${c.nameEn} ===`)
    for (const r of reports.slice(0, 8)) { console.log(`${r.fiscalYear} ${r.periodLabel} ${r.periodType} ${r.sourceName}`); for (const v of r.values) console.log(`  ${v.metricCode} ${v.normalizedValue} ${v.validationStatus} ${v.originalLabel ?? ""} ${(v.validationNotes??"").slice(0,120)}`) }
  }
} finally { await db.$disconnect() }
