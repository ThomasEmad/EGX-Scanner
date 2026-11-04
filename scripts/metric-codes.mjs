// Distinct metric codes in the DB, with counts
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const rows = await db.financialValue.groupBy({ by: ['metricCode'], _count: { id: true }, orderBy: { _count: { id: 'desc' } } })
console.log(rows.map(r => r.metricCode + ':' + r._count.id).join('\n'))
await db.$disconnect()
