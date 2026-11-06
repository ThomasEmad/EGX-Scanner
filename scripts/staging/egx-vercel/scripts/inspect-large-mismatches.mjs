import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  for (const t of ["EFIC","CANA","EAST","HELI","TAQA","EGAL","MPRC","DAPH","ATLC","ASPI"]) {
    const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true, nameEn: true, sector: true } })
    const r = await db.financialReport.findFirst({ where: { companyId: c.id, fiscalYear: 2025, periodType: "ANNUAL" }, orderBy: [{ version: "desc" }, { createdAt: "desc" }], select: { id: true, sourceName: true, version: true, periodLabel: true, periodEnd: true, values: { where: { metricCode: { in: ["TOTAL_ASSETS","TOTAL_LIABILITIES","TOTAL_EQUITY","TOTAL_EQUITY_AND_LIABILITIES","NON_CONTROLLING_INTERESTS","NET_PROFIT","NET_PROFIT_PARENT","REVENUE","PROFIT_BEFORE_TAX","INCOME_TAX"] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true, validationNotes: true } } } })
    console.log(`\n=== ${t} ${c.nameEn} ${c.sector} ${r?.sourceName} v${r?.version} ${r?.periodEnd?.toISOString().slice(0,10)} ===`)
    for (const v of (r?.values??[]).sort((a,b)=>a.metricCode.localeCompare(b.metricCode))) console.log(`  ${v.metricCode} ${v.normalizedValue} ${v.validationStatus} ${(v.validationNotes??"").slice(0,100)}`)
  }
} finally { await db.$disconnect() }
