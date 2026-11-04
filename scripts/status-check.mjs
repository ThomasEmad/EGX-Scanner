import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
for (const t of ['GSSC', 'EXPA', 'HDBK', 'MAAL', 'UBEE', 'NBKE']) {
  const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true } })
  const reps = await db.financialReport.findMany({
    where: { companyId: c.id, deletedAt: null, periodType: 'ANNUAL', fiscalYear: { gte: 2023 } },
    select: { fiscalYear: true, sourceName: true, processingStatus: true, version: true, _count: { select: { values: true } } },
    orderBy: [{ fiscalYear: 'desc' }],
  })
  for (const r of reps) console.log(`${t} FY${r.fiscalYear} ${r.sourceName.slice(0, 28).padEnd(28)} status=${r.processingStatus} v=${r.version} values=${r._count.values}`)
}
await db.$disconnect()
