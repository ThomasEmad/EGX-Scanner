import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const runId = process.argv[2]
const rows = await db.auditIssue.findMany({
  where: { auditRunId: runId, description: { contains: "future" } },
  select: { ticker: true, category: true, severity: true, description: true, period: true },
  take: 50,
})
console.log(JSON.stringify({ runId, count: rows.length, rows }, null, 2))
await db.$disconnect()
