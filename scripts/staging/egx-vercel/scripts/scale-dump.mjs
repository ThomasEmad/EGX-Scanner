// Full dump of all values (all codes, incl. negatives) in curated suspect companies' reports 2020+,
// + market-wide sweeps: profit-flow > 2x equity, quarterly revenue > 2x assets.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const TICKERS = ['UBEE', 'EXPA', 'GSSC', 'MAAL', 'NBKE', 'VLMRA']
const companies = await db.company.findMany({ where: { ticker: { in: TICKERS } }, select: { id: true, ticker: true } })
const byId = new Map(companies.map(c => [c.id, c.ticker]))

const reps = await db.financialReport.findMany({
  where: { companyId: { in: companies.map(c => c.id) }, deletedAt: null, fiscalYear: { gte: 2020 } },
  select: { id: true, companyId: true, fiscalYear: true, periodLabel: true, periodType: true, sourceName: true, statementType: true, values: { select: { metricCode: true, normalizedValue: true, unit: true, originalLabel: true, validationNotes: true } } },
  orderBy: [{ companyId: 'asc' }, { fiscalYear: 'desc' }, { periodLabel: 'desc' }],
})
for (const r of reps) {
  const t = byId.get(r.companyId)
  console.log(`\n# ${t} FY${r.fiscalYear} ${r.periodLabel} [${r.periodType}] ${r.sourceName}`)
  for (const v of r.values) {
    if (v.normalizedValue === null) continue
    const q = (v.validationNotes ?? '').startsWith('AUDIT_QUARANTINE') ? ' [Q]' : ''
    console.log(`    ${v.metricCode.padEnd(30)} = ${Number(v.normalizedValue).toLocaleString()} unit=${v.unit} "${(v.originalLabel ?? '').slice(0, 40)}"${q}`)
  }
}

// market sweeps
const profitRows = await db.$queryRawUnsafe(`
  SELECT c.ticker, COUNT(*) AS n
  FROM FinancialValue v
  JOIN FinancialReport r ON r.id = v.reportId AND r."deletedAt" IS NULL
  JOIN Company c ON c.id = r.companyId
  JOIN (SELECT r2.companyId, MAX(v2."normalizedValue") AS maxEq
        FROM FinancialValue v2 JOIN FinancialReport r2 ON r2.id = v2.reportId AND r2."deletedAt" IS NULL
        WHERE v2.metricCode = 'TOTAL_EQUITY' AND v2."validationStatus" = 'VALID' AND v2."normalizedValue" > 0
          AND (v2.validationNotes IS NULL OR v2.validationNotes NOT LIKE 'AUDIT_QUARANTINE%')
        GROUP BY r2.companyId) e ON e.companyId = r.companyId
  WHERE v."validationStatus" = 'VALID' AND v."normalizedValue" IS NOT NULL AND ABS(v."normalizedValue") > 2 * e.maxEq
    AND v.metricCode IN ('NET_PROFIT','NET_PROFIT_PARENT','GROSS_PROFIT','OPERATING_INCOME','EBITDA','OPERATING_CASH_FLOW','NET_INTEREST_INCOME')
    AND (v.validationNotes IS NULL OR v.validationNotes NOT LIKE 'AUDIT_QUARANTINE%')
  GROUP BY c.ticker ORDER BY COUNT(*) DESC
`)
console.log('\n=== profit-flow |v| > 2x equity (market sweep):')
for (const p of profitRows) console.log(`  ${p.ticker}: ${Number(p.n)} rows`)

const revRows = await db.$queryRawUnsafe(`
  SELECT c.ticker, r."periodType", COUNT(*) AS n, MAX(ABS(v."normalizedValue")) AS maxRev
  FROM FinancialValue v
  JOIN FinancialReport r ON r.id = v.reportId AND r."deletedAt" IS NULL
  JOIN Company c ON c.id = r.companyId
  JOIN (SELECT r2.companyId, MAX(v2."normalizedValue") AS maxA
        FROM FinancialValue v2 JOIN FinancialReport r2 ON r2.id = v2.reportId AND r2."deletedAt" IS NULL
        WHERE v2.metricCode = 'TOTAL_ASSETS' AND v2."validationStatus" = 'VALID' AND v2."normalizedValue" > 0
          AND (v2.validationNotes IS NULL OR v2.validationNotes NOT LIKE 'AUDIT_QUARANTINE%')
        GROUP BY r2.companyId) a ON a.companyId = r.companyId
  WHERE v."validationStatus" = 'VALID' AND v."normalizedValue" IS NOT NULL AND v."normalizedValue" > 0
    AND v.metricCode IN ('REVENUE','TOTAL_REVENUE')
    AND v."normalizedValue" > (CASE WHEN r."periodType" = 'ANNUAL' THEN 8 * a.maxA ELSE 2 * a.maxA END)
    AND (v.validationNotes IS NULL OR v.validationNotes NOT LIKE 'AUDIT_QUARANTINE%')
  GROUP BY c.ticker, r."periodType" ORDER BY COUNT(*) DESC
`)
console.log('\n=== revenue vs assets sweep (annual > 8x, quarterly > 2x):')
for (const p of revRows) console.log(`  ${p.ticker} [${p.periodType}]: ${Number(p.n)} rows, maxRev=${Number(p.maxRev).toLocaleString()}`)
await db.$disconnect()
