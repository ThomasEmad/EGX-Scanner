// 1) VLMRA detail, 2) market-wide ROE-signature scan (profit-like flow > 2x equity),
// 3) full dump of confirmed corrupt reports (all metrics incl. negatives).
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const FLOW_PROFIT = ['NET_PROFIT', 'NET_PROFIT_PARENT', 'GROSS_PROFIT', 'OPERATING_INCOME', 'EBITDA', 'OPERATING_CASH_FLOW', 'NET_INTEREST_INCOME']

// --- 1) VLMRA offending rows
const vl = await db.company.findUnique({ where: { ticker: 'VLMRA' }, select: { id: true } })
if (vl) {
  const reps = await db.financialReport.findMany({
    where: { companyId: vl.id, deletedAt: null },
    select: { fiscalYear: true, periodLabel: true, periodType: true, sourceName: true, values: { where: { validationStatus: 'VALID' }, select: { metricCode: true, normalizedValue: true, unit: true, originalLabel: true } }, },
    orderBy: [{ fiscalYear: 'desc' }, { periodLabel: 'desc' }],
  })
  console.log('=== VLMRA values > 1B:')
  for (const r of reps) for (const v of r.values) {
    if (v.normalizedValue === null) continue
    const val = Number(v.normalizedValue)
    if (Math.abs(val) > 1_000_000_000) console.log(`  FY${r.fiscalYear} ${r.periodLabel} [${r.periodType}] ${r.sourceName.slice(0, 22)} ${v.metricCode} = ${val.toLocaleString()} unit=${v.unit} "${(v.originalLabel ?? '').slice(0, 25)}"`)
  }
}

// --- 2) market scan: profit-like flow > 2x equity (implied annual ROE > 200% = impossible)
const rows = await db.$queryRawUnsafe(`
  SELECT c.ticker, r."periodLabel", r."periodType", r."fiscalYear", r."sourceName",
         v."metricCode", v."normalizedValue" AS val, e.maxEq
  FROM FinancialValue v
  JOIN FinancialReport r ON r.id = v.reportId AND r."deletedAt" IS NULL
  JOIN Company c ON c.id = r.companyId
  JOIN (SELECT r2.companyId, MAX(v2."normalizedValue") AS maxEq
        FROM FinancialValue v2 JOIN FinancialReport r2 ON r2.id = v2.reportId AND r2."deletedAt" IS NULL
        WHERE v2.metricCode = 'TOTAL_EQUITY' AND v2."validationStatus" = 'VALID' AND v2."normalizedValue" > 0
          AND (v2.validationNotes IS NULL OR v2.validationNotes NOT LIKE 'AUDIT_QUARANTINE%')
        GROUP BY r2.companyId) e ON e.companyId = r.companyId
  WHERE v."validationStatus" = 'VALID' AND v."normalizedValue" IS NOT NULL
    AND v.metricCode IN (${FLOW_PROFIT.map(() => '?').join(',')})
    AND ABS(v."normalizedValue") > 2 * e.maxEq
    AND (v.validationNotes IS NULL OR v.validationNotes NOT LIKE 'AUDIT_QUARANTINE%')
  ORDER BY c.ticker, r.fiscalYear DESC
`, ...FLOW_PROFIT)
console.log(`\n=== profit-flow > 2x equity: ${rows.length} rows`)
const seen = new Map()
for (const row of rows) {
  const key = `${row.ticker}|${row.metricCode}`
  if (!seen.has(key)) seen.set(key, [])
  seen.get(key).push(`${row.periodLabel} ${row.fiscalYear} [${row.periodType}] ${row.sourceName.slice(0, 20)} = ${Number(row.val).toLocaleString()} (eq ${Number(row.maxEq).toLocaleString()}, ${Math.round(Number(row.val) / Number(row.maxEq) * 100)}x)`)
}
for (const [k, list] of seen) { console.log(`  ${k}: ${list.length} rows`); for (const s of list.slice(0, 4)) console.log(`     ${s}`) }
await db.$disconnect()
