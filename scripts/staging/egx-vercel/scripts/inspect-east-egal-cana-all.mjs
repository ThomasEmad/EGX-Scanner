import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  for (const [t, years] of [["EAST",[2025,2026]],["EGAL",[2025,2026]],["CANA",[2024,2025]]]) {
    const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true } })
    for (const y of years) {
      const r = await db.financialReport.findFirst({ where: { companyId: c.id, fiscalYear: y, periodType: "ANNUAL" }, orderBy: [{ version: "desc" }, { createdAt: "desc" }], select: { id: true, sourceName: true, version: true, periodStart: true, periodEnd: true, values: { select: { metricCode: true, normalizedValue: true, validationStatus: true } } } })
      console.log(`\n=== ${t} FY${y} ${r?.sourceName} v${r?.version} ${r?.periodStart?.toISOString().slice(0,10)}..${r?.periodEnd?.toISOString().slice(0,10)} ===`)
      for (const v of (r?.values??[]).sort((a,b)=>a.metricCode.localeCompare(b.metricCode))) console.log(`  ${v.metricCode} ${v.normalizedValue} ${v.validationStatus}`)
    }
  }
} finally { await db.$disconnect() }
