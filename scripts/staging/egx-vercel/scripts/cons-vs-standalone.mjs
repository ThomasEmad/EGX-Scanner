// Check CONSOLIDATED vs STANDALONE coexistence: identical values would mean
// the extractor duplicated one statement into both types (extraction bug).
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const companies = await db.company.findMany({ select: { id: true, ticker: true } })
let companiesBoth = 0, yearsChecked = 0, yearsIdentical = 0
const samples = []
for (const { id, ticker } of companies) {
  const reports = await db.financialReport.findMany({
    where: { companyId: id, deletedAt: null, periodType: 'ANNUAL' },
    include: { values: { select: { metricCode: true, normalizedValue: true } } },
  })
  const cons = reports.filter(r => r.statementType === 'CONSOLIDATED')
  const stan = reports.filter(r => r.statementType === 'STANDALONE')
  if (!cons.length || !stan.length) continue
  companiesBoth++
  for (const c of cons) {
    const s = stan.find(x => x.fiscalYear === c.fiscalYear)
    if (!s) continue
    yearsChecked++
    // compare overlapping metrics
    const cm = new Map(c.values.map(v => [v.metricCode, v.normalizedValue]))
    let overlap = 0, same = 0
    for (const v of s.values) {
      const cv = cm.get(v.metricCode)
      if (cv === undefined || v.normalizedValue === null) continue
      overlap++
      const base = Math.max(Math.abs(cv), Math.abs(v.normalizedValue), 1)
      if (Math.abs(cv - v.normalizedValue) / base < 0.0005) same++
    }
    if (overlap >= 3 && same / overlap >= 0.95) {
      yearsIdentical++
      if (samples.length < 15) samples.push(`${ticker} FY${c.fiscalYear}: ${same}/${overlap} identical (${c.sourceName} vs ${s.sourceName})`)
    }
  }
}
console.log(JSON.stringify({ companiesWithBoth: companiesBoth, yearsCompared: yearsChecked, yearsIdentical: yearsIdentical }, null, 2))
console.log(samples.join('\n'))
await db.$disconnect()
