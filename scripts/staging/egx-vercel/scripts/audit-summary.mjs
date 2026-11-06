import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const runs = await db.auditRun.findMany({ orderBy: { startedAt: 'desc' }, take: 1, include: { _count: { select: { issues: true } } } })
const r = runs[0]
const bySev = await db.$queryRawUnsafe(`SELECT severity, COUNT(*) n FROM AuditIssue WHERE auditRunId = ? GROUP BY severity`, r.id)
const byCat = await db.$queryRawUnsafe(`SELECT category, COUNT(*) n FROM AuditIssue WHERE auditRunId = ? GROUP BY category ORDER BY n DESC`, r.id)
const cq = await db.$queryRawUnsafe(`SELECT COUNT(*) n FROM AuditIssue WHERE auditRunId = ? AND description LIKE 'CROSS_QUARTER_DUPLICATE%'`, r.id)
const conf = await db.$queryRawUnsafe(`SELECT rating, COUNT(*) n FROM CompanyConfidenceScore GROUP BY rating`)
console.log('run:', r.id, 'started:', r.startedAt.toISOString(), 'total issues:', r._count.issues)
console.log('by severity:', bySev.map(x => `${x.severity}=${Number(x.n)}`).join(', '))
console.log('by category:', byCat.map(x => `${x.category}=${Number(x.n)}`).join(', '))
console.log('CROSS_QUARTER_DUPLICATE:', Number(cq[0].n))
console.log('confidence bands:', JSON.stringify(conf.map(x => ({ rating: String(x.rating), n: Number(x.n) }))))
await db.$disconnect()
