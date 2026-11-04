import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  for (const ticker of ["ELKA","MHOT","GRCA","GSSC","UNIT","SIPC","EAST","HELI","CANA","COPR","EGAS","DAPH","OFH","ASPI","ATLC"]) {
    const c = await db.company.findFirst({ where: { ticker }, select: { id: true } })
    const reports = await db.financialReport.findMany({ where: { companyId: c.id, fiscalYear: { gte: 2023 } }, orderBy: [{ fiscalYear: "desc" }], select: { id: true, periodLabel: true, periodType: true, fiscalYear: true, sourceName: true, values: { where: { metricCode: { in: ["NET_PROFIT","NET_PROFIT_PARENT","TOTAL_ASSETS","TOTAL_EQUITY"] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true, validationNotes: true, originalLabel: true } } } })
    console.log(`\n=== ${ticker} ===`)
    for (const r of reports.slice(0, 4)) {
      console.log(`${r.fiscalYear} ${r.periodLabel} ${r.periodType} ${r.sourceName}`)
      for (const v of r.values) console.log(`  ${v.metricCode} ${v.normalizedValue} ${v.validationStatus} ${v.originalLabel ?? ""} ${v.validationNotes?.slice(0,100) ?? ""}`)
    }
  }
} finally { await db.$disconnect() }
