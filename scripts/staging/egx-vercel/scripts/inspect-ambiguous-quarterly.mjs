import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  for (const t of ["HELI","DSCW","MPRC","DAPH","ATLC","ASPI"]) {
    const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true, nameEn: true } })
    console.log(`\n######## ${t} ${c.nameEn} ########`)
    const reps = await db.financialReport.findMany({ where: { companyId: c.id, fiscalYear: { gte: 2022 } }, orderBy: [{ fiscalYear: "desc" }, { periodEnd: "desc" }], take: 12, select: { fiscalYear: true, periodType: true, periodLabel: true, periodEnd: true, sourceName: true, values: { where: { metricCode: { in: ["NET_PROFIT","NET_PROFIT_PARENT","GROSS_PROFIT","REVENUE","TOTAL_EQUITY","TOTAL_LIABILITIES","TOTAL_ASSETS"] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true } } } })
    for (const r of reps) console.log(`${r.fiscalYear} ${r.periodType} ${r.periodLabel ?? ""} end=${r.periodEnd?.toISOString().slice(0,10)} [${r.sourceName}] ${r.values.map(v=>`${v.metricCode}=${v.normalizedValue}${v.validationStatus!=="VALID"?"("+v.validationStatus+")":""}`).join(" ")}`)
  }
} finally { await db.$disconnect() }
