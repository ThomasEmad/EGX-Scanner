import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const c = await db.company.findUnique({ where: { ticker: 'UBEE' }, select: { id: true, sharesOutstanding: true, nameEn: true } })
console.log('UBEE sharesOutstanding:', c.sharesOutstanding)
const metrics = await db.calculatedMetric.findMany({
  where: { companyId: c.id, code: { in: ['net_profit', 'revenue', 'eps', 'roe', 'p_e', 'market_cap'] }, fiscalYear: { gte: 2023 } },
  orderBy: [{ fiscalYear: 'desc' }, { periodLabel: 'desc' }],
  select: { code: true, value: true, valueStatus: true, periodLabel: true, periodType: true },
})
for (const m of metrics) console.log(`  ${m.code.padEnd(10)} [${m.periodType} ${m.periodLabel}] = ${m.value === null ? 'null' : Number(m.value).toLocaleString()} (${m.valueStatus})`)
console.log('\n--- raw NET_PROFIT / NET_PROFIT_PARENT / REVENUE values (reports 2023+):')
const reps = await db.financialReport.findMany({
  where: { companyId: c.id, deletedAt: null, fiscalYear: { gte: 2023 } },
  orderBy: [{ fiscalYear: 'desc' }, { periodLabel: 'desc' }],
  select: { fiscalYear: true, periodLabel: true, periodType: true, sourceName: true, values: { where: { metricCode: { in: ['NET_PROFIT', 'NET_PROFIT_PARENT', 'REVENUE'] } }, select: { metricCode: true, normalizedValue: true, unit: true, currency: true, originalLabel: true, validationStatus: true, validationNotes: true } } },
})
for (const r of reps) {
  for (const v of r.values) {
    const q = (v.validationNotes ?? '').startsWith('AUDIT_QUARANTINE') ? ' [Q]' : ''
    console.log(`  FY${r.fiscalYear} ${r.periodLabel.padEnd(10)} [${r.periodType}] ${r.sourceName.slice(0, 30).padEnd(30)} ${v.metricCode.padEnd(16)} = ${v.normalizedValue === null ? 'null' : Number(v.normalizedValue).toLocaleString()} unit=${v.unit} cur=${v.currency} "${(v.originalLabel ?? '').slice(0, 28)}"${q}`)
  }
}
await db.$disconnect()
