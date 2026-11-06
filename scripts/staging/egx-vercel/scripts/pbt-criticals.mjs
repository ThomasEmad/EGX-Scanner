import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const run = await db.auditRun.findFirst({ orderBy: { startedAt: "desc" }, select: { id: true } })
  const issues = await db.auditIssue.findMany({ where: { auditRunId: run.id, severity: "critical", description: { contains: "PBT_TAX" } }, select: { ticker: true, period: true, description: true } })
  for (const i of issues) console.log(`\n${i.ticker} ${i.period}\n${i.description}`)
} finally { await db.$disconnect() }
