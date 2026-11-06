import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const ticker = process.argv[2] ?? "UNIT"
try {
  const company = await db.company.findFirst({ where: { ticker }, select: { id: true, ticker: true, sector: true } })
  if (!company) { console.log("not found"); process.exit(0) }
  console.log("company", company.ticker, company.sector, company.id)
  const reports = await db.financialReport.findMany({
    where: { companyId: company.id },
    orderBy: [{ fiscalYear: "desc" }, { periodLabel: "desc" }, { version: "desc" }],
    select: {
      id: true, periodLabel: true, periodType: true, fiscalYear: true, statementType: true, version: true, processingStatus: true,
      values: { where: { metricCode: { in: ["NET_PROFIT", "NET_PROFIT_PARENT", "TOTAL_EQUITY", "REVENUE", "TOTAL_ASSETS"] } }, select: { metricCode: true, normalizedValue: true, subPeriod: true, validationStatus: true, validationNotes: true } },
    },
  })
  for (const r of reports.slice(0, 8)) {
    console.log(`\n${r.periodLabel} ${r.periodType} FY${r.fiscalYear} ${r.statementType} v${r.version} ${r.processingStatus}`)
    for (const v of r.values) console.log(`  ${v.metricCode} sub=${v.subPeriod} val=${v.normalizedValue} ${v.validationStatus} ${v.validationNotes ? v.validationNotes.slice(0,60) : ""}`)
  }
  const cms = await db.calculatedMetric.findMany({
    where: { companyId: company.id, code: { in: ["roe", "net_profit", "total_equity"] } },
    orderBy: [{ fiscalYear: "desc" }, { periodKey: "desc" }],
    take: 20,
    select: { code: true, value: true, periodKey: true, periodLabel: true, periodType: true, statementType: true, valueStatus: true, fiscalYear: true },
  })
  console.log("\nCALCULATED")
  for (const m of cms) console.log(`  ${m.code} ${m.value} ${m.periodLabel} ${m.periodType} ${m.statementType} ${m.valueStatus}`)
} finally { await db.$disconnect() }
