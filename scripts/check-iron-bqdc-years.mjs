import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  for (const t of ["IRON","BQDC"]) {
    const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true } })
    const reports = await db.financialReport.findMany({ where: { companyId: c.id, periodType: "ANNUAL", fiscalYear: { gte: 2019 } }, orderBy: { fiscalYear: "asc" }, select: { fiscalYear: true, values: { where: { metricCode: { in: ["TOTAL_ASSETS","NET_PROFIT","TOTAL_EQUITY"] } }, select: { metricCode: true, normalizedValue: true } } } })
    console.log(`\n${t}`)
    for (const r of reports) console.log(`${r.fiscalYear}: ${r.values.map(v=>`${v.metricCode}=${v.normalizedValue}`).join(" ")}`)
  }
} finally { await db.$disconnect() }
