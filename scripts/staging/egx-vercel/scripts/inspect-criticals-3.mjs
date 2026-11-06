import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const want = [
  ["EGAS", 2024, "ANNUAL"],
  ["OFH", 2024, "ANNUAL"],
  ["DAPH", 2025, "ANNUAL"],
  ["AMER", 2026, "Q2"],
  ["BINV", 2026, "Q2"],
  ["EMFD", 2026, "Q2"],
  ["HRHO", 2026, "Q2"],
]
try {
  for (const [ticker, year, period] of want) {
    const c = await db.company.findUnique({ where: { ticker }, select: { id: true, nameEn: true } })
    if (!c) { console.log(`${ticker} missing`); continue }
    const where = period === "ANNUAL" ? { companyId: c.id, fiscalYear: year, periodType: "ANNUAL" } : { companyId: c.id, fiscalYear: year, periodType: "QUARTERLY", periodLabel: { contains: period } }
    const r = await db.financialReport.findFirst({ where, orderBy: [{ version: "desc" }, { createdAt: "desc" }], select: { id: true, sourceName: true, version: true, values: { where: { metricCode: { in: ["TOTAL_ASSETS","TOTAL_LIABILITIES","TOTAL_EQUITY","NON_CONTROLLING_INTERESTS","REVENUE","COGS","GROSS_PROFIT","NET_PROFIT","NET_PROFIT_PARENT","PROFIT_BEFORE_TAX","INCOME_TAX","OPERATING_INCOME"] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true, validationNotes: true } } } })
    console.log(`\n=== ${ticker} ${year} ${period} ${c.nameEn} ${r?.sourceName} v${r?.version} ===`)
    if (!r) continue
    for (const v of r.values.sort((a,b)=>a.metricCode.localeCompare(b.metricCode))) console.log(`  ${v.metricCode} ${v.normalizedValue} ${v.validationStatus} ${(v.validationNotes??"").slice(0,90)}`)
  }
} finally { await db.$disconnect() }
