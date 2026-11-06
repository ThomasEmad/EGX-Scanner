import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()

async function show(ticker, labels = null) {
  const co = await db.company.findFirst({ where: { ticker } })
  if (!co) return
  const reps = await db.financialReport.findMany({
    where: { companyId: co.id, deletedAt: null, ...(labels ? { periodLabel: { in: labels } } : {}) },
    include: { values: { where: { subPeriod: "CURRENT", metricCode: { in: [
      "TOTAL_ASSETS","TOTAL_LIABILITIES","TOTAL_EQUITY","NON_CONTROLLING_INTERESTS","CURRENT_LIABILITIES","NON_CURRENT_LIABILITIES",
      "CURRENT_ASSETS","NON_CURRENT_ASSETS","TOTAL_EQUITY_AND_LIABILITIES",
      "OPERATING_CASH_FLOW","INVESTING_CASH_FLOW","FINANCING_CASH_FLOW","NET_CHANGE_IN_CASH","FX_EFFECT_CASH","OPENING_CASH","CLOSING_CASH",
      "REVENUE","COGS","GROSS_PROFIT","NET_PROFIT","PROFIT_BEFORE_TAX","INCOME_TAX" ] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true, validationNotes: true } } },
    orderBy: [{ fiscalYear: "desc" }, { periodLabel: "desc" }],
    take: 4,
  })
  console.log(`\n===== ${ticker} =====`)
  for (const r of reps) {
    console.log(`-- ${r.periodLabel} ${r.periodType}/${r.statementType}/${r.sourceName}`)
    for (const v of r.values) console.log(`   ${v.metricCode.padEnd(30)} ${Math.round(v.normalizedValue).toString().padStart(18)} ${v.validationStatus} ${v.validationNotes?.slice(0,40) ?? ""}`)
  }
}

try {
  for (const t of ["AALR","ABUK","ACGC","IRON","SPHT","AMOC"]) await show(t)
} finally { await db.$disconnect() }
