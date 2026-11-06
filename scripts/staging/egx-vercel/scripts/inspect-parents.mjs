import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  for (const [ticker, year] of [["ELKA",2024],["MHOT",2025],["GSSC",2025],["UNIT",2024],["COPR",2024],["SIPC",2025]]) {
    const c = await db.company.findUnique({ where: { ticker }, select: { id: true } })
    const r = await db.financialReport.findFirst({ where: { companyId: c.id, fiscalYear: year, periodType: "ANNUAL" }, orderBy: [{ statementType: "asc" }, { createdAt: "desc" }], select: { id: true, statementType: true, sourceName: true, values: { select: { metricCode: true, normalizedValue: true, validationStatus: true, validationNotes: true } } } })
    console.log(`\n=== ${ticker} ${year} ${r.statementType} ${r.sourceName} ===`)
    for (const v of r.values.sort((a,b)=>a.metricCode.localeCompare(b.metricCode))) console.log(`${v.metricCode} ${v.normalizedValue} ${v.validationStatus} ${(v.validationNotes??"").slice(0,80)}`)
  }
  for (const [ticker, year, label] of [["SIPC",2025,"Q1"],["UNIT",2025,"Q1"]]) {
    const c = await db.company.findUnique({ where: { ticker }, select: { id: true } })
    const r = await db.financialReport.findFirst({ where: { companyId: c.id, fiscalYear: year, periodType: "QUARTERLY", periodLabel: { contains: label } }, select: { id: true, statementType: true, sourceName: true, values: { select: { metricCode: true, normalizedValue: true, validationStatus: true } } } })
    console.log(`\n=== ${ticker} ${year} ${label} ${r.statementType} ${r.sourceName} ===`)
    for (const v of r.values.sort((a,b)=>a.metricCode.localeCompare(b.metricCode))) console.log(`${v.metricCode} ${v.normalizedValue} ${v.validationStatus}`)
  }
} finally { await db.$disconnect() }
