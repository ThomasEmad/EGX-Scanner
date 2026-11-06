// MFPC net_margin=159% root cause + sector-mixing checks
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const c = await db.company.findUnique({ where: { ticker: 'MFPC' }, select: { id: true } })
const rows = await db.financialReport.findMany({
  where: { companyId: c.id, deletedAt: null, fiscalYear: { gte: 2023 } },
  include: { values: { where: { metricCode: { in: ['REVENUE', 'NET_PROFIT', 'GROSS_PROFIT', 'COGS'] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true, validationNotes: true } } },
  orderBy: [{ fiscalYear: 'desc' }, { periodLabel: 'desc' }],
  take: 10,
})
for (const r of rows) {
  const v = Object.fromEntries(r.values.map(v => [v.metricCode, v.normalizedValue]))
  const notes = r.values.filter(x => (x.validationNotes ?? '').startsWith('AUDIT_QUARANTINE')).map(x => x.metricCode)
  console.log(`${r.periodLabel} [${r.periodType}] src=${r.sourceName.slice(0, 40)} | REV=${v.REVENUE ?? '-'} NP=${v.NET_PROFIT ?? '-'} GP=${v.GROSS_PROFIT ?? '-'} COGS=${v.COGS ?? '-'} ${notes.length ? 'QUARANTINED:' + notes.join(',') : ''}`)
}
await db.$disconnect()
