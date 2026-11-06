// Cross-quarter duplication detector: consecutive quarterly reports whose
// overlapping values are >= 90% identical (impossible under discrete AND
// cumulative conventions). Reports the LATER report as the duplicate.
import { PrismaClient } from '@prisma/client'
import { writeFileSync } from 'node:fs'
const db = new PrismaClient()

const companies = await db.company.findMany({ where: { isActive: true }, select: { id: true, ticker: true } })
const suspects = [] // { ticker, label, id, sourceName, dupOf }
let totalSuspectValues = 0

for (const { id, ticker } of companies) {
  const reports = await db.financialReport.findMany({
    where: { companyId: id, deletedAt: null, periodType: 'QUARTERLY' },
    include: { values: { where: { validationStatus: { not: 'FAILED' }, NOT: { validationNotes: { startsWith: 'AUDIT_QUARANTINE' } } }, select: { id: true, metricCode: true, normalizedValue: true } } },
    orderBy: [{ fiscalYear: 'asc' }, { periodLabel: 'asc' }],
  })
  // index by chronological key
  const idx = reports.map(r => {
    const m = r.periodLabel.toUpperCase().match(/Q([1-4])/)
    return { r, key: r.fiscalYear * 10 + (m ? Number(m[1]) : 0) }
  }).sort((a, b) => a.key - b.key)
  for (let i = 1; i < idx.length; i++) {
    const cur = idx[i].r, prev = idx[i - 1].r
    if (!cur.values.length || !prev.values.length) continue
    const prevMap = new Map(prev.values.map(v => [v.metricCode, v.normalizedValue]))
    let overlap = 0, same = 0
    for (const v of cur.values) {
      const pv = prevMap.get(v.metricCode)
      if (pv === undefined || pv === null || v.normalizedValue === null) continue
      overlap++
      if (Math.abs(v.normalizedValue - pv) / Math.max(Math.abs(pv), 1) < 0.0005) same++
    }
    if (overlap >= 5 && same / overlap >= 0.9) {
      totalSuspectValues += cur.values.length
      suspects.push({ ticker, reportId: cur.id, label: cur.periodLabel, fy: cur.fiscalYear, source: cur.sourceName, dupOf: prev.periodLabel, overlap, same, valueIds: cur.values.map(v => v.id) })
      console.log(`${ticker} ${cur.periodLabel} (${cur.sourceName.slice(0, 30)}) ≈ ${prev.periodLabel}: ${same}/${overlap} identical`)
    }
  }
}
writeFileSync('crossquarter-dupes.json', JSON.stringify(suspects, null, 2))
console.log(`\nsuspect duplicate reports: ${suspects.length}, values involved: ${totalSuspectValues}`)
await db.$disconnect()
