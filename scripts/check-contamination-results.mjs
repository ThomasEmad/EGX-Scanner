import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  for (const t of ["EAST","EGAL","CANA","SIPC","BQDC","IRON","UNIT"]) {
    const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true } })
    const rows = await db.calculatedMetric.findMany({ where: { companyId: c.id, code: { in: ["roe","roa","net_profit","revenue","total_assets","total_equity"] }, periodType: { in: ["ANNUAL","TTM"] } }, orderBy: [{ fiscalYear: "desc" }, { periodType: "asc" }], select: { code: true, periodLabel: true, periodType: true, value: true, valueStatus: true } })
    console.log(`\n${t}: ${rows.slice(0,10).map(r=>`${r.code}/${r.periodLabel}=${r.value}(${r.valueStatus})`).join(" | ")}`)
  }
} finally { await db.$disconnect() }
