// Full contamination analysis → file: collision groups with source attribution,
// totals, and the intra-company value-reuse sample (EPS pairs excluded as legit).
import { PrismaClient } from '@prisma/client'
import { writeFileSync } from 'node:fs'
const db = new PrismaClient()

// Cross-company exact-value collisions (impossible naturally when >= 3 companies)
const rows = await db.$queryRawUnsafe(`
  SELECT fv.metricCode, fr.fiscalYear, fv.normalizedValue AS val,
         COUNT(DISTINCT fv.companyId) AS nCompanies,
         COUNT(*) AS nRows,
         MIN(c.ticker) AS minT, MAX(c.ticker) AS maxT,
         GROUP_CONCAT(DISTINCT fr.sourceName) AS sources,
         GROUP_CONCAT(DISTINCT fv.reportId) AS reportIds
  FROM FinancialValue fv
  JOIN FinancialReport fr ON fr.id = fv.reportId AND fr.deletedAt IS NULL AND fr.periodType = 'ANNUAL'
  JOIN Company c ON c.id = fv.companyId
  WHERE fv.normalizedValue IS NOT NULL
    AND ABS(fv.normalizedValue) > 100000
    AND fv.validationStatus != 'FAILED'
    AND fv.validationNotes IS NULL
  GROUP BY fv.metricCode, fr.fiscalYear, fv.normalizedValue
  HAVING COUNT(DISTINCT fv.companyId) >= 3
`)
const rows3 = await db.$queryRawUnsafe(`
  SELECT COUNT(*) AS n, COUNT(DISTINCT fv.companyId) AS nc
  FROM (
    SELECT fv.companyId
    FROM FinancialValue fv
    JOIN FinancialReport fr ON fr.id = fv.reportId AND fr.deletedAt IS NULL AND fr.periodType = 'ANNUAL'
    WHERE fv.normalizedValue IS NOT NULL AND ABS(fv.normalizedValue) > 100000
      AND fv.validationStatus != 'FAILED' AND fv.validationNotes IS NULL
    GROUP BY fv.metricCode, fr.fiscalYear, fv.normalizedValue
    HAVING COUNT(DISTINCT fv.companyId) >= 3
  ) fv
  JOIN Company c ON c.id = fv.companyId
`)

const bySource = new Map()
const byMetric = new Map()
let totalRows = 0
const companies = new Set()
for (const r of rows) {
  totalRows += Number(r.nRows)
  for (const s of String(r.sources).split(',')) bySource.set(s, (bySource.get(s) ?? 0) + Number(r.nRows))
  byMetric.set(r.metricCode, (byMetric.get(r.metricCode) ?? 0) + Number(r.nRows))
}
// companies involved — need full list
const comp = await db.$queryRawUnsafe(`
  SELECT DISTINCT c.ticker
  FROM FinancialValue fv
  JOIN FinancialReport fr ON fr.id = fv.reportId AND fr.deletedAt IS NULL AND fr.periodType = 'ANNUAL'
  JOIN Company c ON c.id = fv.companyId
  WHERE fv.normalizedValue IS NOT NULL AND ABS(fv.normalizedValue) > 100000
    AND fv.validationStatus != 'FAILED' AND fv.validationNotes IS NULL
  AND EXISTS (
    SELECT 1 FROM FinancialValue fv2
    JOIN FinancialReport fr2 ON fr2.id = fv2.reportId AND fr2.deletedAt IS NULL AND fr2.periodType = 'ANNUAL'
    WHERE fv2.normalizedValue = fv.normalizedValue AND fv2.metricCode = fv.metricCode
      AND fv2.companyId != fv.companyId
  )
`)
const out = {
  collisionGroups: rows.length,
  rowsAt3plus: Number(rows3[0].n),
  companiesAt3plus: comp.map(c => c.ticker),
  bySource: Object.fromEntries([...bySource.entries()].sort((a, b) => b[1] - a[1])),
  byMetric: Object.fromEntries([...byMetric.entries()].sort((a, b) => b[1] - a[1])),
  sample: rows.slice(0, 25).map(r => ({ m: r.metricCode, fy: r.fiscalYear, v: String(r.val), n: Number(r.nCompanies), src: r.sources })),
}
writeFileSync('contamination-report.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify({ collisionGroups: out.collisionGroups, rowsAt3plus: out.rowsAt3plus, companiesCount: out.companiesAt3plus.length, bySource: out.bySource, byMetric: out.byMetric }, null, 2))
await db.$disconnect()
