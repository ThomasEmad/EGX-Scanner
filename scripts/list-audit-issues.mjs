import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const runId = process.argv[2]
const severity = process.argv[3] ?? "critical"
const rows = await db.auditIssue.findMany({
  where: { auditRunId: runId, severity },
  select: { ticker: true, category: true, description: true, descriptionAr: true, metricCode: true, period: true, currentValue: true, expectedValue: true, status: true },
  orderBy: [{ ticker: "asc" }, { category: "asc" }],
})
console.log(JSON.stringify({ runId, severity, count: rows.length, rows }, null, 2))
await db.$disconnect()
