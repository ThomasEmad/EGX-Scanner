// Fast contamination analysis: single pass GROUP BY (no EXISTS self-join).
// Identifies rows whose (metricCode, fiscalYear, normalizedValue) exact value is
// shared by >= 3 DIFFERENT companies — impossible naturally for values > 100k.
import { PrismaClient } from '@prisma/client'
import { writeFileSync } from 'node:fs'
const db = new PrismaClient()

const groups = await db.$queryRawUnsafe(`
  SELECT fv.metricCode AS metricCode, fr.fiscalYear AS fiscalYear, fv.normalizedValue AS val,
         COUNT(DISTINCT fv.companyId) AS nCompanies,
         GROUP_CONCAT(DISTINCT c.ticker) AS tickers,
         GROUP_CONCAT(DISTINCT fr.sourceName) AS sources,
         GROUP_CONCAT(fv.id) AS valueIds
  FROM FinancialValue fv
  JOIN FinancialReport fr ON fr.id = fv.reportId AND fr.deletedAt IS NULL AND fr.periodType = 'ANNUAL'
  JOIN Company c ON c.id = fv.companyId
  WHERE fv.normalizedValue IS NOT NULL
    AND ABS(fv.normalizedValue) > 100000
    AND fv.validationStatus != 'FAILED'
    AND (fv.validationNotes IS NULL OR fv.validationNotes NOT LIKE 'AUDIT_QUARANTINE%')
  GROUP BY fv.metricCode, fr.fiscalYear, fv.normalizedValue
  HAVING COUNT(DISTINCT fv.companyId) >= 3
`)

const bySource = new Map(), byMetric = new Map()
const companies = new Set()
let rowsToQuarantine = []
for (const g of groups) {
  const srcs = String(g.sources).split(',')
  for (const s of srcs) bySource.set(s, (bySource.get(s) ?? 0) + Number(g.nCompanies))
  byMetric.set(g.metricCode, (byMetric.get(g.metricCode) ?? 0) + Number(g.nCompanies))
  const tickers = String(g.tickers).split(',')
  for (const t of tickers) companies.add(t)
  rowsToQuarantine.push(...String(g.valueIds).split(','))
}

const out = {
  groups: groups.length,
  rowsToQuarantine: rowsToQuarantine.length,
  companiesInvolved: [...companies].sort(),
  bySource: Object.fromEntries([...bySource.entries()].sort((a, b) => b[1] - a[1])),
  byMetric: Object.fromEntries([...byMetric.entries()].sort((a, b) => b[1] - a[1])),
  worstGroups: groups.slice(0, 20).map(g => ({ m: g.metricCode, fy: g.fiscalYear, v: String(g.val), n: Number(g.nCompanies), t: String(g.tickers).slice(0, 80) })),
}
writeFileSync('contamination-report.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify({ groups: out.groups, rows: out.rowsToQuarantine, companies: out.companiesInvolved.length, bySource: out.bySource, byMetric: out.byMetric }, null, 2))
await db.$disconnect()
