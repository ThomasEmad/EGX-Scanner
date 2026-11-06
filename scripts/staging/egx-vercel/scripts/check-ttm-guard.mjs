import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  for (const t of ["HELI","MCQE","MPRC","ATLC","ASPI","DSCW","ABUK","FERC","ADCI"]) {
    const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true } })
    const rows = await db.calculatedMetric.findMany({ where: { companyId: c.id, code: { in: ["net_profit","roe"] }, periodType: "TTM" }, orderBy: [{ fiscalYear: "desc" }, { periodKey: "desc" }], take: 6, select: { code: true, value: true, periodLabel: true, valueStatus: true } })
    console.log(`${t}: ${rows.map(r=>`${r.code}/${r.periodLabel}=${r.value}(${r.valueStatus})`).join(" | ") || "no TTM"}`)
  }
} finally { await db.$disconnect() }
