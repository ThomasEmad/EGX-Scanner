import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  for (const t of ["ALCN","EFIC","EAST","CSAG","ARCC","MBSC"]) {
    const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true, nameEn: true } })
    const reps = await db.financialReport.findMany({ where: { companyId: c.id, periodType: "ANNUAL" }, orderBy: { fiscalYear: "desc" }, take: 2, select: { fiscalYear: true, values: { where: { metricCode: { in: ["NET_PROFIT","NET_PROFIT_PARENT","NON_CONTROLLING_INTERESTS","TOTAL_EQUITY","TOTAL_ASSETS","TOTAL_LIABILITIES"] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true } } } })
    console.log(`\n${t} ${c.nameEn}`)
    for (const r of reps) console.log(`${r.fiscalYear}: ${r.values.map(v=>`${v.metricCode}=${v.normalizedValue}${v.validationStatus!=="VALID"?"("+v.validationStatus+")":""}`).join(" ")}`)
  }
} finally { await db.$disconnect() }
