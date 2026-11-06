import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  for (const t of ["BQDC","IRON"]) {
    const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true, nameEn: true } })
    const r = await db.financialReport.findFirst({ where: { companyId: c.id, fiscalYear: 2020, periodType: "ANNUAL" }, orderBy: [{ version: "desc" }, { createdAt: "desc" }], select: { sourceName: true, values: { where: { metricCode: { in: ["NET_PROFIT","TOTAL_ASSETS","TOTAL_EQUITY","TOTAL_LIABILITIES"] } }, select: { metricCode: true, normalizedValue: true, originalValue: true, isManuallyCorrected: true } } } })
    console.log(`\n${t} ${c.nameEn} FY2020 ${r?.sourceName}`)
    for (const v of r?.values ?? []) console.log(`  ${v.metricCode} ${v.normalizedValue} original=${v.originalValue} manual=${v.isManuallyCorrected}`)
  }
} finally { await db.$disconnect() }
