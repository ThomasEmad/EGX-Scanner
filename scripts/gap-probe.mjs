// Investigate post-fix DATA_UNAVAILABLE gaps + CCAP x10 suspicion.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const probes = [
  { ticker: 'GSSC', years: [2024, 2025] },
  { ticker: 'EXPA', years: [2024, 2025] },
  { ticker: 'MAAL', years: [2023] },
  { ticker: 'CCAP', years: [2022, 2024] },
]
for (const p of probes) {
  const c = await db.company.findUnique({ where: { ticker: p.ticker }, select: { id: true } })
  console.log(`\n=== ${p.ticker} annual reports FY${p.years.join('/')} (NET_PROFIT/REVENUE/EBITDA):`)
  const reps = await db.financialReport.findMany({
    where: { companyId: c.id, deletedAt: null, periodType: 'ANNUAL', fiscalYear: { in: p.years } },
    select: { fiscalYear: true, periodLabel: true, sourceName: true, statementType: true, values: { where: { metricCode: { in: ['NET_PROFIT', 'NET_PROFIT_PARENT', 'REVENUE', 'EBITDA', 'TOTAL_EQUITY'] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true, validationNotes: true, correctedBy: true } } },
    orderBy: [{ fiscalYear: 'desc' }],
  })
  for (const r of reps) {
    for (const v of r.values) {
      const q = (v.validationNotes ?? '').startsWith('AUDIT_QUARANTINE') ? ' [Q]' : (v.correctedBy ? ` [${v.correctedBy}]` : '')
      console.log(`  FY${r.fiscalYear} ${r.sourceName.slice(0, 30).padEnd(30)} [${r.statementType ?? '?'}] ${v.metricCode.padEnd(18)} = ${v.normalizedValue === null ? 'null' : Number(v.normalizedValue).toLocaleString()}${q}`)
    }
  }
  // calculated metric rows for those years
  const cms = await db.calculatedMetric.findMany({
    where: { companyId: c.id, code: { in: ['net_profit', 'revenue'] }, fiscalYear: { in: p.years } },
    orderBy: [{ code: 'asc' }, { periodType: 'asc' }],
    select: { code: true, value: true, valueStatus: true, periodLabel: true, periodType: true, statementType: true, sourcePeriods: true },
  })
  for (const m of cms) console.log(`  CM ${m.code.padEnd(11)} [${m.periodType} ${m.periodLabel} ${m.statementType ?? '?'}] = ${m.value === null ? 'null' : Number(m.value).toLocaleString()} (${m.valueStatus}) src=${JSON.stringify(m.sourcePeriods)?.slice(0, 90)}`)
}
await db.$disconnect()
