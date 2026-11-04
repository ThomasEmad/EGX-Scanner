import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  for (const [t, y, pt, pl] of [["HRHO",2026,"QUARTERLY","Q2 2026"],["BINV",2026,"QUARTERLY","Q2 2026"],["AMER",2026,"QUARTERLY","Q2 2026"],["OFH",2024,"ANNUAL","FY 2024"],["AMER",2021,"ANNUAL","FY 2021"],["EGTS",2024,"ANNUAL","FY 2024"],["GIHD",2024,"ANNUAL","FY 2024"],["MMAT",2025,"ANNUAL","FY 2025"]]) {
    const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true, nameEn: true } })
    const r = await db.financialReport.findFirst({ where: { companyId: c.id, fiscalYear: y, periodType: pt, periodLabel: pl }, orderBy: [{ version: "desc" }, { createdAt: "desc" }], select: { periodEnd: true, sourceName: true, values: { where: { metricCode: { in: ["PROFIT_BEFORE_TAX","INCOME_TAX","NET_PROFIT","NET_PROFIT_PARENT","NON_CONTROLLING_INTERESTS","REVENUE"] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true } } } })
    console.log(`${t} ${pl} ${r?.periodEnd?.toISOString().slice(0,10)} [${r?.sourceName}] ${r?.values.map(v=>`${v.metricCode}=${v.normalizedValue}(${v.validationStatus})`).join(" ")}`)
  }
} finally { await db.$disconnect() }
