// Probe MAAL EPS/NI/shares across all reports to scope the FY2021 EPS x1000 fix.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const c = await db.company.findUnique({ where: { ticker: 'MAAL' }, select: { id: true } })
const reps = await db.financialReport.findMany({
  where: { companyId: c.id, deletedAt: null, values: { some: { metricCode: { in: ['BASIC_EPS', 'DILUTED_EPS'] } } } },
  select: { fiscalYear: true, periodLabel: true, periodType: true, sourceName: true, values: { where: { metricCode: { in: ['BASIC_EPS', 'DILUTED_EPS', 'NET_PROFIT', 'SHARES_OUTSTANDING'] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true, validationNotes: true } } },
  orderBy: [{ fiscalYear: 'asc' }, { periodLabel: 'asc' }],
})
for (const r of reps) {
  const get = (code) => r.values.find(v => v.metricCode === code)
  const fmt = (v) => v === undefined || v.normalizedValue === null ? '—' : Number(v.normalizedValue).toLocaleString()
  const np = get('NET_PROFIT'), sh = get('SHARES_OUTSTANDING')
  const implied = np && sh && np.normalizedValue !== null && sh.normalizedValue !== null && Number(sh.normalizedValue) > 0
    ? (Number(np.normalizedValue) / Number(sh.normalizedValue)).toFixed(3) : ''
  const q = (v) => (v?.validationNotes ?? '').startsWith('AUDIT_QUARANTINE') ? ' [Q]' : ''
  console.log(`FY${r.fiscalYear} ${r.periodLabel.padEnd(10)} [${r.periodType.slice(0, 4)}] ${r.sourceName.slice(0, 24).padEnd(24)} BASIC=${fmt(get('BASIC_EPS'))}${q(get('BASIC_EPS'))} DIL=${fmt(get('DILUTED_EPS'))}${q(get('DILUTED_EPS'))} NP=${fmt(np)} SH=${fmt(sh)} impliedEPS=${implied}`)
}
await db.$disconnect()
