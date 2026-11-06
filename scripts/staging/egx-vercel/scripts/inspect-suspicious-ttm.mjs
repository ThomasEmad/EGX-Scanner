import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  for (const t of ["ADRI","ADCI","MCQE","FERC","ABUK"]) {
    const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true, nameEn: true, sector: true } })
    console.log(`\n######## ${t} ${c.nameEn} [${c.sector}] ########`)
    const reps = await db.financialReport.findMany({ where: { companyId: c.id }, orderBy: [{ fiscalYear: "desc" }, { periodEnd: "desc" }], take: 10, select: { fiscalYear: true, periodType: true, periodLabel: true, periodEnd: true, sourceName: true, values: { where: { metricCode: { in: ["NET_PROFIT","NET_PROFIT_PARENT","TOTAL_EQUITY","REVENUE"] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true } } } })
    for (const r of reps) console.log(`${r.fiscalYear} ${r.periodType} ${r.periodLabel ?? ""} end=${r.periodEnd?.toISOString().slice(0,10)} [${r.sourceName}] ${r.values.map(v=>`${v.metricCode}=${v.normalizedValue}${v.validationStatus!=="VALID"?"("+v.validationStatus+")":""}`).join(" ")}`)
    const cms = await db.calculatedMetric.findMany({ where: { companyId: c.id, code: { in: ["net_profit","roe","net_margin"] }, valueStatus: "OK" }, orderBy: [{ fiscalYear: "desc" }, { periodKey: "desc" }], take: 12, select: { code: true, value: true, periodType: true, periodLabel: true, fiscalYear: true, periodKey: true } })
    console.log("CALC:", cms.map(r=>`${r.code}/${r.periodLabel}=${r.value}`).join(" | "))
  }
} finally { await db.$disconnect() }
