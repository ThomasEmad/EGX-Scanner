// VALU: all non-quarantined reports (the Yahoo garbage family?)
// FERC: which annual carries equity=145.6M?
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const forTicker = async (ticker, extra = {}) => {
  const c = await db.company.findUnique({ where: { ticker }, select: { id: true } })
  const reps = await db.financialReport.findMany({
    where: { companyId: c.id, deletedAt: null, ...extra },
    orderBy: [{ fiscalYear: 'desc' }, { periodLabel: 'desc' }],
    select: { id: true, fiscalYear: true, periodLabel: true, periodType: true, sourceName: true, version: true, values: { where: { NOT: { validationNotes: { startsWith: 'AUDIT_QUARANTINE' } } }, select: { metricCode: true, normalizedValue: true, validationStatus: true } } },
  })
  return reps
}

console.log('=== VALU reports (non-quarantined value counts) ===')
for (const r of await forTicker('VALU')) {
  const eq = r.values.find(v => v.metricCode === 'TOTAL_EQUITY')
  const as = r.values.find(v => v.metricCode === 'TOTAL_ASSETS')
  const rev = r.values.find(v => v.metricCode === 'REVENUE')
  const fmt = x => (x && x.normalizedValue !== null && x.normalizedValue !== undefined) ? Number(x.normalizedValue).toLocaleString() : '-'
  console.log(`FY${r.fiscalYear} ${r.periodLabel.padEnd(12)} [${r.periodType.padEnd(9)}] ${r.sourceName.slice(0, 32).padEnd(32)} v${r.version} n=${r.values.length} REV=${fmt(rev)} ASSETS=${fmt(as)} EQ=${fmt(eq)}`)
}

console.log('\n=== FERC annual reports ===')
for (const r of await forTicker('FERC', { periodType: 'ANNUAL' })) {
  const eq = r.values.find(v => v.metricCode === 'TOTAL_EQUITY')
  const as = r.values.find(v => v.metricCode === 'TOTAL_ASSETS')
  const fmt = x => (x && x.normalizedValue !== null && x.normalizedValue !== undefined) ? Number(x.normalizedValue).toLocaleString() : '-'
  console.log(`FY${r.fiscalYear} ${r.periodLabel.padEnd(12)} ${r.sourceName.slice(0, 32).padEnd(32)} v${r.version} n=${r.values.length} ASSETS=${fmt(as)} EQ=${fmt(eq)}`)
}
await db.$disconnect()
