// Inspect persisted AuditIssue rows for ORHD + COMI (duplicate analysis)
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const latestRun = await db.auditRun.findFirst({ orderBy: { startedAt: 'desc' } })
console.log('latest run:', latestRun.id, latestRun.startedAt.toISOString(), latestRun.status)

const orhd = await db.auditIssue.findMany({
  where: { auditRunId: latestRun.id, ticker: 'ORHD', description: { contains: 'BALANCE_SHEET' } },
  select: { period: true, description: true, currentValue: true, expectedValue: true, detectedAt: true },
  orderBy: { period: 'asc' },
})
for (const i of orhd) console.log(i.period, '|', i.description.slice(0, 120), '| cur=', i.currentValue, 'exp=', i.expectedValue)

const comiDup = await db.auditIssue.findMany({
  where: { auditRunId: latestRun.id, ticker: 'COMI', description: { contains: 'DUPLICATE' } },
  select: { period: true, description: true },
})
for (const i of comiDup) console.log('COMI DUP:', i.period, '|', i.description.slice(0, 140))

const counts = await db.auditIssue.groupBy({ by: ['category', 'severity'], _count: { id: true }, where: { auditRunId: latestRun.id } })
console.log('\ncategory/severity:', counts.map(c => `${c.category}:${c.severity}=${c._count.id}`).join(', '))
await db.$disconnect()
