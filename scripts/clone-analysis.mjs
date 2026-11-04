// Deep-dive: for corrupted quarterly rows, is the WHOLE report a clone of the
// annual report, or only the cash-flow values? Sample COMI + ETEL + SWDY.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

for (const ticker of ['COMI', 'ETEL', 'SWDY']) {
  const c = await db.company.findUnique({ where: { ticker }, select: { id: true, nameEn: true } })
  const reports = await db.financialReport.findMany({
    where: { companyId: c.id, deletedAt: null, periodType: { in: ['ANNUAL', 'QUARTERLY'] } },
    include: { values: { select: { metricCode: true, normalizedValue: true } } },
    orderBy: [{ fiscalYear: 'asc' }, { periodLabel: 'asc' }],
  })
  const byYear = new Map()
  for (const r of reports) {
    if (!byYear.has(r.fiscalYear)) byYear.set(r.fiscalYear, { annual: null, quarters: [] })
    const g = byYear.get(r.fiscalYear)
    if (r.periodType === 'ANNUAL') g.annual = r
    else g.quarters.push(r)
  }
  for (const [year, g] of byYear) {
    if (!g.annual || g.quarters.length === 0) continue
    const annVals = new Map(g.annual.values.map(v => [v.metricCode, v.normalizedValue]))
    for (const q of g.quarters) {
      if (!q.periodLabel.toUpperCase().match(/Q([1-3])/)) continue // only Q1-Q3 (Q4 cumulative=FY is legit)
      let totalComparable = 0, sameCount = 0, cfSame = 0, cfTotal = 0
      for (const v of q.values) {
        const av = annVals.get(v.metricCode)
        if (av === undefined || v.normalizedValue === null) continue
        totalComparable++
        const rel = Math.abs(v.normalizedValue - av) / Math.max(Math.abs(av), 1)
        if (rel < 0.001) {
          sameCount++
          if (['OPERATING_CASH_FLOW', 'INVESTING_CASH_FLOW', 'FINANCING_CASH_FLOW'].includes(v.metricCode)) cfSame++
        }
      }
      const isClone = totalComparable > 5 && sameCount / totalComparable > 0.9
      console.log(`${ticker} FY${year} ${q.periodLabel} src=${q.sourceName}: values=${q.values.length} overlap=${totalComparable} identical=${sameCount} (${(100 * sameCount / Math.max(totalComparable, 1)).toFixed(0)}%) ${isClone ? '>>> WHOLE-REPORT CLONE' : 'partial'}`)
      if (ticker === 'COMI' && year === 2022) break // one sample is enough for clone analysis
    }
    if (ticker === 'COMI' && year === 2022) break
  }
}
await db.$disconnect()
