import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  for (const ticker of ["EAST","HELI","CANA","UNIT","GSSC","ELKA","MHOT","ORAS","HDBK","SIPC"]) {
    const c = await db.company.findFirst({ where: { ticker }, select: { id: true } })
    const rows = await db.calculatedMetric.findMany({ where: { companyId: c.id, code: { in: ["net_profit","net_profit_parent","total_equity","equity_parent"] }, periodType: "ANNUAL" }, orderBy: [{ fiscalYear: "desc" }], take: 8, select: { code: true, value: true, valueStatus: true, fiscalYear: true, statementType: true } })
    console.log(`\n${ticker}`)
    for (const r of rows) console.log(`  ${r.fiscalYear} ${r.code} ${r.value} ${r.valueStatus} ${r.statementType}`)
  }
} finally { await db.$disconnect() }
