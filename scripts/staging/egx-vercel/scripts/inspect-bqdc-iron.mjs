import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  for (const t of ["BQDC","IRON"]) {
    const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true } })
    const r = await db.financialReport.findFirst({ where: { companyId: c.id, fiscalYear: 2020, periodType: "ANNUAL" }, orderBy: [{ version: "desc" }, { createdAt: "desc" }], select: { id: true, sourceName: true, values: { select: { metricCode: true, normalizedValue: true, validationStatus: true } } } })
    console.log(`\n=== ${t} FY2020 ${r?.sourceName} ===`)
    for (const v of (r?.values??[]).sort((a,b)=>a.metricCode.localeCompare(b.metricCode))) console.log(`  ${v.metricCode} ${v.normalizedValue} ${v.validationStatus}`)
  }
} finally { await db.$disconnect() }
