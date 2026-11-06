import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const oras = await db.company.findUnique({ where: { ticker: 'ORAS' }, select: { id: true } })
const reps = await db.financialReport.findMany({
  where: { companyId: oras.id, deletedAt: null },
  orderBy: [{ fiscalYear: 'desc' }, { periodLabel: 'desc' }],
  select: { periodLabel: true, periodType: true, fiscalYear: true, periodStart: true, periodEnd: true, sourceName: true },
})
for (const r of reps) console.log(r.periodLabel.padEnd(10), 'PS=', r.periodStart ? r.periodStart.toISOString().slice(0, 10) : '-', 'PE=', r.periodEnd ? r.periodEnd.toISOString().slice(0, 10) : '-', r.sourceName.slice(0, 28))
await db.$disconnect()
