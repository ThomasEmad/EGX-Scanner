import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  for (const ticker of ["RAYA","MBSC","WCDF","VLMRA","MPCI","ARCC","MCQE","SCTS"]) {
    const c = await db.company.findFirst({ where: { ticker }, select: { id: true, nameEn: true } })
    const cms = await db.calculatedMetric.findMany({ where: { companyId: c.id, code: { in: ["roe","net_profit","total_equity","revenue"] }, periodType: { in: ["TTM","ANNUAL","QUARTERLY"] }, fiscalYear: { gte: 2025 } }, orderBy: [{ fiscalYear: "desc" }, { periodType: "asc" }], select: { code: true, value: true, valueStatus: true, periodLabel: true, periodType: true, fiscalYear: true, sourcePeriods: true } })
    console.log(`\n=== ${ticker} | ${c.nameEn} ===`)
    for (const r of cms.slice(0, 24)) console.log(`${r.fiscalYear} ${r.periodLabel} ${r.periodType} ${r.code} ${r.value} ${r.valueStatus} ${r.sourcePeriods}`)
  }
} finally { await db.$disconnect() }
