import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  for (const [t, y] of [["SIPC",2024],["CANA",2024],["CANA",2025],["EAST",2025],["EGAL",2025],["EGAL",2026]]) {
    const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true } })
    const r = await db.financialReport.findFirst({ where: { companyId: c.id, fiscalYear: y, periodType: "ANNUAL" }, orderBy: [{ version: "desc" }, { createdAt: "desc" }], select: { periodEnd: true, values: { where: { metricCode: { in: ["NET_PROFIT","NET_PROFIT_PARENT","REVENUE","GROSS_PROFIT","TOTAL_ASSETS","TOTAL_EQUITY","TOTAL_LIABILITIES","TOTAL_EQUITY_AND_LIABILITIES"] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true } } } })
    console.log(`${t} ${y} end=${r?.periodEnd?.toISOString().slice(0,10)} ${r?.values.map(v=>`${v.metricCode}=${v.normalizedValue}(${v.validationStatus})`).join(" ")}`)
  }
} finally { await db.$disconnect() }
