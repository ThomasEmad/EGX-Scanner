// Dump report structure for ORHD + COMI to locate the audit's duplicate findings
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

for (const ticker of ['ORHD', 'COMI']) {
  const c = await db.company.findUnique({ where: { ticker }, select: { id: true } })
  const reports = await db.financialReport.findMany({
    where: { companyId: c.id, deletedAt: null },
    select: { id: true, periodType: true, periodLabel: true, fiscalYear: true, statementType: true, sourceName: true, processingStatus: true, createdAt: true, _count: { select: { values: true } } },
    orderBy: [{ fiscalYear: 'asc' }, { periodLabel: 'asc' }],
  })
  console.log(`\n=== ${ticker} (${reports.length} reports) ===`)
  for (const r of reports) {
    console.log(`${r.periodLabel} | ${r.periodType} | FY=${r.fiscalYear} | ${r.statementType} | ${r.sourceName} | ${r.processingStatus} | ${r._count.values}v | created ${r.createdAt.toISOString().slice(0, 10)}`)
  }
}
await db.$disconnect()
