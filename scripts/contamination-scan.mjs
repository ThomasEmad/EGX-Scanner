// Quantify copy-paste contamination: the same normalizedValue appearing
// (a) across >=3 DIFFERENT companies for the same (metric, year), or
// (b) twice within the same company-year for different metrics (value reuse).
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const rows = await db.$queryRawUnsafe(`
  SELECT fv.metricCode, fr.fiscalYear, fv.normalizedValue,
         COUNT(DISTINCT fv.companyId) AS nCompanies,
         GROUP_CONCAT(DISTINCT c.ticker) AS tickers
  FROM FinancialValue fv
  JOIN FinancialReport fr ON fr.id = fv.reportId AND fr.deletedAt IS NULL AND fr.periodType = 'ANNUAL'
  JOIN Company c ON c.id = fv.companyId
  WHERE fv.normalizedValue IS NOT NULL
    AND ABS(fv.normalizedValue) > 100000
    AND fv.validationStatus != 'FAILED'
    AND fv.validationNotes IS NULL
  GROUP BY fv.metricCode, fr.fiscalYear, fv.normalizedValue
  HAVING COUNT(DISTINCT fv.companyId) >= 4
  ORDER BY nCompanies DESC
  LIMIT 60
`)
console.log('=== cross-company exact-value collisions (>=4 companies share exact value) ===')
let contaminatedRows = 0, contaminatedCompanies = new Set()
for (const r of rows) {
  contaminatedRows += Number(r.nCompanies)
  for (const t of String(r.tickers).split(',')) contaminatedCompanies.add(t)
  console.log(`${r.metricCode} FY${r.fiscalYear} value=${r.normalizedValue} × ${r.nCompanies} companies: ${String(r.tickers).slice(0, 90)}`)
}
console.log(`\nrough contaminated value rows (upper bound): ${contaminatedRows}, companies involved: ${contaminatedCompanies.size}`)

// intra-company: same value on 2+ different metrics in the same company-year
const intra = await db.$queryRawUnsafe(`
  SELECT fv.companyId, c.ticker, fr.fiscalYear, fv.normalizedValue, COUNT(DISTINCT fv.metricCode) AS nMetrics,
           GROUP_CONCAT(DISTINCT fv.metricCode) AS metrics
  FROM FinancialValue fv
  JOIN FinancialReport fr ON fr.id = fv.reportId AND fr.deletedAt IS NULL AND fr.periodType = 'ANNUAL'
  JOIN Company c ON c.id = fv.companyId
  WHERE fv.normalizedValue IS NOT NULL AND ABS(fv.normalizedValue) > 100000
    AND fv.validationStatus != 'FAILED' AND fv.validationNotes IS NULL
  GROUP BY fv.companyId, fr.fiscalYear, fv.normalizedValue
  HAVING COUNT(DISTINCT fv.metricCode) >= 2
  LIMIT 40
`)
console.log(`\n=== intra-company same-value-different-metric rows: ${intra.length} (sample) ===`)
for (const r of intra.slice(0, 25)) console.log(`${r.ticker} FY${r.fiscalYear} value=${r.normalizedValue} on [${r.metrics}]`)
await db.$disconnect()
