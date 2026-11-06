import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const c = await db.company.findFirst({ where: { ticker: "GSSC" }, select: { id: true } })
  const rows = await db.calculatedMetric.findMany({ where: { companyId: c.id, code: { in: ["roe","net_profit","total_equity"] }, periodType: "ANNUAL" }, orderBy: [{ fiscalYear: "desc" }], select: { code: true, value: true, valueStatus: true, periodLabel: true, fiscalYear: true, sourcePeriods: true } })
  for (const r of rows) console.log(r.code, r.value, r.valueStatus, r.periodLabel, r.sourcePeriods)
} finally { await db.$disconnect() }
