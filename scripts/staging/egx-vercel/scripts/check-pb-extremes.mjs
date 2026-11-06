// Verify the extreme P/B names (AIFI, AMES): are their equity/shares/price
// inputs real, or leftover fabricated values the collision scan missed?
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

for (const ticker of ['AIFI', 'AMES']) {
  const c = await db.company.findUnique({ where: { ticker }, select: { id: true, sharesOutstanding: true, nameEn: true } })
  if (!c) { console.log(ticker, 'NOT FOUND'); continue }
  const latest = await db.calculatedMetric.findMany({
    where: { companyId: c.id, code: { in: ['p_b', 'market_cap', 'book_value_per_share'] }, valueStatus: 'OK', value: { not: null } },
    orderBy: [{ fiscalYear: 'desc' }, { periodLabel: 'desc' }], take: 3,
    select: { code: true, value: true, periodType: true, periodLabel: true },
  })
  console.log(`\n=== ${ticker} (${c.nameEn}) shares=${c.sharesOutstanding}`)
  for (const m of latest) console.log(`  ${m.code} [${m.periodType} ${m.periodLabel}] = ${Number(m.value).toLocaleString()}`)
  const rep = await db.financialReport.findFirst({
    where: { companyId: c.id, deletedAt: null, periodType: 'ANNUAL' },
    orderBy: [{ fiscalYear: 'desc' }],
    include: { values: { where: { metricCode: { in: ['TOTAL_EQUITY', 'SHARES_OUTSTANDING'] }, validationStatus: 'VALID' }, select: { metricCode: true, normalizedValue: true, validationNotes: true } } },
  })
  if (rep) {
    console.log(`  latest annual: FY${rep.fiscalYear} src=${(rep.sourceName ?? '').slice(0, 40)}`)
    for (const v of rep.values) console.log(`    ${v.metricCode} = ${Number(v.normalizedValue).toLocaleString()}`)
  }
}
// how many OTHER companies have p_b > 20 right now (potential leftovers)?
const pbs = await db.$queryRawUnsafe(`
  SELECT c.ticker AS t, cm.value AS v, cm."periodLabel" AS pl FROM CalculatedMetric cm
  JOIN Company c ON c.id = cm.companyId
  WHERE cm.code = 'p_b' AND cm."valueStatus" = 'OK' AND cm.value > 20 AND cm."fiscalYear" >= 2025
  ORDER BY cm.value DESC LIMIT 12`)
console.log('\np_b > 20 (FY2025+):', pbs.map(r => `${r.t}=${Number(r.v).toFixed(0)}`).join(', '))
await db.$disconnect()
