// Sample-verify collision groups: print the full (ticker, metric, year, value)
// rows for 6 groups — 2 from EXCEL_STATEMENTS, 2 from ASKBORA_SUMMARY,
// 2 from YAHOO/TRADINGVIEW — to eyeball plausibility before quarantine.
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'
const db = new PrismaClient()

const data = JSON.parse(readFileSync('contamination-fabricated.json', 'utf8'))
const ids = data.quarantineIds

// recompute groups quickly
const groups = await db.$queryRawUnsafe(`
  SELECT fv.metricCode AS metricCode, fr.fiscalYear AS fiscalYear, fv.normalizedValue AS val,
         COUNT(DISTINCT fv.companyId) AS nCompanies,
         GROUP_CONCAT(c.ticker) AS tickers,
         GROUP_CONCAT(fr.sourceName) AS sources
  FROM FinancialValue fv
  JOIN FinancialReport fr ON fr.id = fv.reportId AND fr.deletedAt IS NULL AND fr.periodType = 'ANNUAL'
  JOIN Company c ON c.id = fv.companyId
  WHERE fv.normalizedValue IS NOT NULL AND ABS(fv.normalizedValue) > 100000
    AND fv.validationStatus != 'FAILED'
    AND (fv.validationNotes IS NULL OR fv.validationNotes NOT LIKE 'AUDIT_QUARANTINE%')
  GROUP BY fv.metricCode, fr.fiscalYear, fv.normalizedValue
  HAVING COUNT(DISTINCT fv.companyId) >= 3
  ORDER BY nCompanies DESC
`)
const pick = []
const seen = new Set()
for (const g of groups) {
  const sig = String(g.sources)
  const bucket = sig.includes('EXCEL') ? 'excel' : sig.includes('ASKBORA') ? 'askbora' : 'other'
  if (!seen.has(bucket) || (bucket === 'other' && pick.filter(p => p.bucket === 'other').length < 2)) {
    seen.add(bucket)
    pick.push({ bucket, ...g })
    if (pick.filter(p => p.bucket === 'excel').length >= 2 && pick.filter(p => p.bucket === 'askbora').length >= 2 && pick.filter(p => p.bucket === 'other').length >= 2) break
  }
}
for (const g of pick) {
  console.log(`\n=== ${g.metricCode} FY${g.fiscalYear} val=${g.val} ×${g.nCompanies} [${g.bucket}]`)
  const ids2 = String(g.id ? g.id : '').split(',')
  // fetch rows for this group by matching metric+year+value
  const rows = await db.$queryRawUnsafe(`
    SELECT c.ticker AS t, fr.sourceName AS s, fr.periodLabel AS pl
    FROM FinancialValue fv
    JOIN FinancialReport fr ON fr.id = fv.reportId
    JOIN Company c ON c.id = fv.companyId
    WHERE fv.metricCode = ? AND fr.fiscalYear = ? AND ABS(fv.normalizedValue - ?) < 0.001
      AND fr.deletedAt IS NULL
  `, g.metricCode, g.fiscalYear, Number(g.val))
  console.log(rows.map(r => `${r.t}(${r.s})`).slice(0, 40).join(', '))
}
await db.$disconnect()
