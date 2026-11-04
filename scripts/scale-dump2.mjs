// Dump the newly-suspect companies' profit-flow rows > 2x equity with context:
// value, /1000 test vs equity & assets, source, period, statement type.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const TICKERS = ['SCFM', 'GROV', 'RAKT', 'HDBK', 'UPMS', 'MEGM', 'CCAP', 'SAIB', 'ROTO']
const P = ['NET_PROFIT', 'NET_PROFIT_PARENT', 'GROSS_PROFIT', 'OPERATING_INCOME', 'EBITDA', 'OPERATING_CASH_FLOW', 'NET_INTEREST_INCOME']
const companies = await db.company.findMany({ where: { ticker: { in: TICKERS } }, select: { id: true, ticker: true, nameEn: true } })

for (const c of companies) {
  const rows = await db.$queryRawUnsafe(`
    SELECT r."fiscalYear", r."periodLabel", r."periodType", r.sourceName, v."metricCode", v."normalizedValue" AS val,
           e.maxEq, a.maxA
    FROM FinancialValue v
    JOIN FinancialReport r ON r.id = v.reportId AND r."deletedAt" IS NULL
    JOIN Company cc ON cc.id = r.companyId
    JOIN (SELECT r2.companyId, MAX(v2."normalizedValue") AS maxEq FROM FinancialValue v2
          JOIN FinancialReport r2 ON r2.id = v2.reportId AND r2."deletedAt" IS NULL
          WHERE v2.metricCode = 'TOTAL_EQUITY' AND v2."validationStatus" = 'VALID' AND v2."normalizedValue" > 0
            AND (v2.validationNotes IS NULL OR v2.validationNotes NOT LIKE 'AUDIT_QUARANTINE%') GROUP BY r2.companyId) e ON e.companyId = r.companyId
    LEFT JOIN (SELECT r3.companyId, MAX(v3."normalizedValue") AS maxA FROM FinancialValue v3
          JOIN FinancialReport r3 ON r3.id = v3.reportId AND r3."deletedAt" IS NULL
          WHERE v3.metricCode = 'TOTAL_ASSETS' AND v3."validationStatus" = 'VALID' AND v3."normalizedValue" > 0
            AND (v3.validationNotes IS NULL OR v3.validationNotes NOT LIKE 'AUDIT_QUARANTINE%') GROUP BY r3.companyId) a ON a.companyId = r.companyId
    WHERE r.companyId = ? AND v."validationStatus" = 'VALID' AND v."normalizedValue" IS NOT NULL
      AND v.metricCode IN (${P.map(() => '?').join(',')}) AND ABS(v."normalizedValue") > 2 * e.maxEq
      AND (v.validationNotes IS NULL OR v.validationNotes NOT LIKE 'AUDIT_QUARANTINE%')
    ORDER BY r.fiscalYear DESC, r."periodLabel" DESC, v."metricCode"
  `, c.id, ...P)
  console.log(`\n=== ${c.ticker} (${c.nameEn}): ${rows.length} suspect rows`)
  for (const r of rows) {
    const val = Number(r.val), eq = Number(r.maxEq ?? 0), as = Number(r.maxA ?? 0)
    console.log(`  FY${r.fiscalYear} ${String(r.periodLabel).padEnd(10)} [${r.periodType}] ${r.sourceName.slice(0, 20).padEnd(20)} ${r.metricCode.padEnd(20)} = ${val.toLocaleString()} eq=${eq ? eq.toLocaleString() : '?'} assets=${as ? as.toLocaleString() : '?'} /1000=${(val / 1000).toLocaleString()}`)
  }
}
await db.$disconnect()
