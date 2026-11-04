// Quantify the "annual copied into quarterly" cash-flow corruption across all companies.
// For each (company, fiscalYear): if a QUARTERLY report's OCF/ICF/FCF EXACTLY equals the
// ANNUAL report's value (same year), it's the propagation bug.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const CF = ['OPERATING_CASH_FLOW', 'INVESTING_CASH_FLOW', 'FINANCING_CASH_FLOW']

const companies = await db.company.findMany({
  select: { id: true, ticker: true, sector: true },
  where: { isActive: true },
})

let affectedCompanies = 0
let totalSuspectRows = 0
const perCompany = []

for (const c of companies) {
  const reports = await db.financialReport.findMany({
    where: { companyId: c.id, deletedAt: null, periodType: { in: ['ANNUAL', 'QUARTERLY'] } },
    include: { values: { where: { metricCode: { in: CF } }, select: { metricCode: true, normalizedValue: true } } },
    orderBy: [{ fiscalYear: 'asc' }, { periodLabel: 'asc' }],
  })
  // group by year
  const byYear = new Map()
  for (const r of reports) {
    if (!byYear.has(r.fiscalYear)) byYear.set(r.fiscalYear, { annual: null, quarters: [] })
    const g = byYear.get(r.fiscalYear)
    if (r.periodType === 'ANNUAL') g.annual = r
    else g.quarters.push(r)
  }
  let suspectRows = 0
  let suspectQuarters = 0
  for (const [year, g] of byYear) {
    if (!g.annual || g.annual.values.length < 2) continue
    const annVals = new Map(g.annual.values.map(v => [v.metricCode, v.normalizedValue]))
    for (const q of g.quarters) {
      let sameCount = 0
      for (const [code, val] of annVals) {
        const qv = q.values.find(v => v.metricCode === code)
        if (qv && qv.normalizedValue !== null && val !== null) {
          const rel = Math.abs(qv.normalizedValue - val) / Math.max(Math.abs(val), 1)
          if (rel < 0.001) sameCount++
        }
      }
      if (sameCount >= 2) { suspectRows++; suspectQuarters++ }
    }
  }
  if (suspectQuarters > 0) {
    affectedCompanies++
    totalSuspectRows += suspectRows
    perCompany.push(`${c.ticker}(${suspectQuarters}q)`)
  }
}
console.log(JSON.stringify({ affectedCompanies, totalSuspectRows }, null, 2))
console.log('affected:', perCompany.join(', '))
await db.$disconnect()
