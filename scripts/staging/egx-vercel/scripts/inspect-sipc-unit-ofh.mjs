import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const run = await db.auditRun.findFirst({ orderBy: { startedAt: "desc" } })
  for (const t of ["SIPC","UNIT","OFH","EGAS"]) {
    const issues = await db.auditIssue.findMany({ where: { auditRunId: run.id, ticker: t, severity: { in: ["critical","high"] } }, select: { severity: true, period: true, metricCode: true, description: true, currentValue: true, expectedValue: true } })
    console.log(`\n=== ${t} ===`)
    for (const i of issues) console.log(`[${i.severity}] ${i.period ?? ""} ${i.metricCode ?? ""} | ${i.description.slice(0,220)} | cur=${i.currentValue} exp=${i.expectedValue}`)
  }
} finally { await db.$disconnect() }
