import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const want = [
  ["TALM", 2025, "ANNUAL"],
  ["COPR", 2023, "ANNUAL"],
  ["SPHT", 2021, "ANNUAL"],
  ["SPHT", 2022, "ANNUAL"],
  ["EFIC", 2025, "ANNUAL"],
  ["ASPI", 2024, "ANNUAL"],
  ["UEGC", 2021, "ANNUAL"],
  ["NDRL", 2020, "ANNUAL"],
]
try {
  for (const [ticker, year, period] of want) {
    const c = await db.company.findUnique({ where: { ticker }, select: { id: true, nameEn: true } })
    if (!c) { console.log(`${ticker} missing`); continue }
    const r = await db.financialReport.findFirst({ where: { companyId: c.id, fiscalYear: year, periodType: period }, orderBy: [{ version: "desc" }, { createdAt: "desc" }], select: { id: true, sourceName: true, version: true, values: { where: { metricCode: { in: ["TOTAL_ASSETS","TOTAL_LIABILITIES","TOTAL_EQUITY","NON_CONTROLLING_INTERESTS","CURRENT_ASSETS","NON_CURRENT_ASSETS","CASH_AND_EQUIVALENTS","REVENUE","COGS","GROSS_PROFIT","NET_PROFIT","NET_PROFIT_PARENT","PROFIT_BEFORE_TAX","INCOME_TAX"] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true, validationNotes: true } } } })
    console.log(`\n=== ${ticker} ${year} ${c.nameEn} ${r?.sourceName} v${r?.version} ===`)
    if (!r) continue
    for (const v of r.values.sort((a,b)=>a.metricCode.localeCompare(b.metricCode))) console.log(`  ${v.metricCode} ${v.normalizedValue} ${v.validationStatus} ${(v.validationNotes??"").slice(0,80)}`)
  }
} finally { await db.$disconnect() }
