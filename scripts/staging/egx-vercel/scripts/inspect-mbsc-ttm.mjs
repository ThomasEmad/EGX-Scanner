import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const c = await db.company.findUnique({ where: { ticker: "MBSC" }, select: { id: true } })
  const reports = await db.financialReport.findMany({ where: { companyId: c.id, periodType: "QUARTERLY", fiscalYear: { gte: 2025 } }, orderBy: [{ fiscalYear: "asc" }, { periodLabel: "asc" }], select: { fiscalYear: true, periodLabel: true, periodEnd: true, sourceName: true, values: { where: { metricCode: { in: ["NET_PROFIT","NET_PROFIT_PARENT","REVENUE","TOTAL_EQUITY","TOTAL_ASSETS"] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true, validationNotes: true, sourceText: true } } } })
  for (const r of reports) {
    console.log(`\n${r.periodLabel} end=${r.periodEnd?.toISOString().slice(0,10)} ${r.sourceName}`)
    for (const v of r.values) console.log(`  ${v.metricCode} ${v.normalizedValue} ${v.validationStatus} ${(v.validationNotes??"").slice(0,90)} ${(v.sourceText??"").slice(0,60)}`)
  }
  const calc = await db.calculatedMetric.findMany({ where: { companyId: c.id, code: { in: ["roe","roa","net_profit","ttm_net_profit"] }, periodType: "TTM" }, orderBy: { periodLabel: "desc" }, select: { code: true, periodLabel: true, value: true, valueStatus: true, statusDetail: true, sourcePeriods: true } })
  console.log("\nTTM CALC")
  for (const r of calc) console.log(`${r.code} ${r.periodLabel} ${r.value} ${r.valueStatus} ${r.statusDetail ?? ""} src=${r.sourcePeriods}`)
} finally { await db.$disconnect() }
