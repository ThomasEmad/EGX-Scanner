import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  for (const t of ["MPCI","AXPH"]) {
    const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true } })
    const rows = await db.calculatedMetric.findMany({ where: { companyId: c.id, code: "roe", value: { not: null } }, orderBy: [{ fiscalYear: "desc" }, { periodType: "asc" }], select: { value: true, periodLabel: true, periodType: true, valueStatus: true } })
    console.log(t, rows.slice(0, 6).map(r => `${r.periodLabel}:${r.value?.toFixed(2)}`).join(" | "))
  }
} finally { await db.$disconnect() }
