import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const run = await db.auditRun.findFirst({ orderBy: { startedAt: "desc" }, select: { id: true } })
  const issues = await db.auditIssue.findMany({ where: { auditRunId: run.id, severity: "critical", description: { contains: "PBT_TAX" } }, select: { ticker: true, period: true, description: true } })
  console.log(`PBT criticals: ${issues.length}`)
  for (const i of issues) console.log(`${i.ticker} ${i.period}: ${i.description.slice(0,150)}`)
  const high = await db.auditIssue.findMany({ where: { auditRunId: run.id, severity: "high", description: { contains: "PBT_TAX" } }, select: { ticker: true, period: true } })
  console.log(`PBT high: ${high.map(h=>h.ticker+" "+h.period).join(", ")}`)
} finally { await db.$disconnect() }
