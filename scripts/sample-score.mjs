import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const run = await db.auditRun.findFirst({ orderBy: { startedAt: "desc" } })
  const s = await db.companyConfidenceScore.findFirst({ where: { auditRunId: run.id } })
  console.log(JSON.stringify(s, null, 2))
  const issue = await db.auditIssue.findFirst({ where: { auditRunId: run.id, severity: "critical" } })
  console.log(JSON.stringify(issue, null, 2))
} finally { await db.$disconnect() }
