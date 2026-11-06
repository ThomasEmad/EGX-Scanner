import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const r = await db.auditRun.findFirst({ orderBy: { startedAt: 'desc' }, select: { id: true } })
const rows = await db.auditIssue.findMany({ where: { auditRunId: r.id, category: 'cross_source' }, select: { ticker: true, description: true, severity: true } })
for (const x of rows) console.log(x.ticker, `[${x.severity}]`, x.description.slice(0, 160))
await db.$disconnect()
