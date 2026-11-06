import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const tickers = ["SCFM","PRCL","AALR","ALEX","COPR","UNIT","SIPC","GSSC","OFH"]
const bsCodes = ["TOTAL_ASSETS","TOTAL_LIABILITIES","TOTAL_EQUITY","CURRENT_ASSETS","CURRENT_LIABILITIES","NON_CURRENT_ASSETS","NON_CURRENT_LIABILITIES","CASH_AND_EQUIVALENTS","TOTAL_DEBT","NET_PROFIT","NET_PROFIT_PARENT","REVENUE","COGS","GROSS_PROFIT","PBT","TAX_EXPENSE"]
try {
  const run = await db.auditRun.findFirst({ orderBy: { startedAt: "desc" } })
  for (const t of tickers) {
    const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true, nameEn: true } })
    if (!c) continue
    console.log(`\n=== ${t} | ${c.nameEn} ===`)
    const issues = await db.auditIssue.findMany({ where: { auditRunId: run.id, ticker: t, severity: { in: ["critical","high"] } }, select: { severity: true, category: true, description: true, currentValue: true, expectedValue: true } })
    for (const i of issues) console.log(`  [${i.severity}] ${i.description.slice(0,220)} | cur=${i.currentValue} exp=${i.expectedValue}`)
    const reports = await db.financialReport.findMany({ where: { companyId: c.id, fiscalYear: { gte: 2023 } }, orderBy: [{ fiscalYear: "desc" }, { periodType: "asc" }], take: 8, select: { fiscalYear: true, periodLabel: true, periodType: true, statementType: true, sourceName: true, values: { where: { metricCode: { in: bsCodes } }, select: { metricCode: true, normalizedValue: true, validationStatus: true, originalLabel: true, validationNotes: true } } } })
    for (const r of reports) {
      if (!r.values.length) continue
      console.log(`  ${r.fiscalYear} ${r.periodLabel} ${r.periodType} ${r.statementType} ${r.sourceName}`)
      for (const v of r.values) console.log(`    ${v.metricCode} ${v.normalizedValue} ${v.validationStatus} ${(v.validationNotes??"").slice(0,100)}`)
    }
  }
} finally { await db.$disconnect() }
