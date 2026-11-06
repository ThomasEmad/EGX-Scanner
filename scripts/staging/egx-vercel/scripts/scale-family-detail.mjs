// Detail probe for the x1000 scale family: list offending P&L values per company
// with source/period/unit/label, and test whether /1000 lands sane vs equity.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const FLOW = ['NET_PROFIT', 'NET_PROFIT_PARENT', 'REVENUE', 'GROSS_PROFIT', 'OPERATING_INCOME', 'EBITDA', 'OPERATING_CASH_FLOW', 'NET_INTEREST_INCOME']
const TICKERS = process.argv[2] ? process.argv[2].split(',') : ['AMOC', 'MAAL', 'CEFM', 'EXPA', 'GSSC', 'MOSC', 'NBKE', 'UBEE', 'VLMRA']

const companies = await db.company.findMany({
  where: { ticker: { in: TICKERS } },
  select: { id: true, ticker: true, nameEn: true },
})

for (const c of companies) {
  // sane anchors: max equity & assets from any non-quarantined value
  const anchors = await db.$queryRawUnsafe(`
    SELECT MAX(CASE WHEN v.metricCode = 'TOTAL_EQUITY' THEN v."normalizedValue" END) AS maxEq,
           MAX(CASE WHEN v.metricCode = 'TOTAL_ASSETS' THEN v."normalizedValue" END) AS maxAssets
    FROM FinancialValue v
    JOIN FinancialReport r ON r.id = v.reportId AND r."deletedAt" IS NULL
    WHERE r.companyId = ? AND v."validationStatus" = 'VALID' AND v."normalizedValue" > 0
      AND (v.validationNotes IS NULL OR v.validationNotes NOT LIKE 'AUDIT_QUARANTINE%')
  `, c.id)
  const maxEq = Number(anchors[0]?.maxEq ?? 0)
  const maxAssets = Number(anchors[0]?.maxAssets ?? 0)

  const offending = await db.financialValue.findMany({
    where: { metricCode: { in: FLOW }, validationStatus: 'VALID', normalizedValue: { gt: 0 } },
    select: { metricCode: true, normalizedValue: true, unit: true, currency: true, originalLabel: true, validationNotes: true, report: { select: { fiscalYear: true, periodLabel: true, periodType: true, sourceName: true, statementType: true } } },
  }).catch(() => null)
  // need per-company: use reports
  const reps = await db.financialReport.findMany({
    where: { companyId: c.id, deletedAt: null },
    select: { fiscalYear: true, periodLabel: true, periodType: true, sourceName: true, statementType: true, values: { where: { metricCode: { in: FLOW }, validationStatus: 'VALID' }, select: { metricCode: true, normalizedValue: true, unit: true, currency: true, originalLabel: true, validationNotes: true } } },
    orderBy: [{ fiscalYear: 'desc' }, { periodLabel: 'desc' }],
  })
  console.log(`\n=== ${c.ticker} (${c.nameEn}) maxEq=${maxEq ? maxEq.toLocaleString() : 'n/a'} maxAssets=${maxAssets ? maxAssets.toLocaleString() : 'n/a'}`)
  for (const r of reps) {
    for (const v of r.values) {
      const val = Number(v.normalizedValue)
      if (val <= 0) continue
      if (maxAssets && val > 3 * maxAssets) {
        const fixed = val / 1000
        const fixROE = maxEq ? ((fixed / maxEq) * 100).toFixed(0) : '?'
        const rawROE = maxEq ? ((val / maxEq) * 100).toFixed(0) : '?'
        console.log(`  FY${r.fiscalYear} ${r.periodLabel.padEnd(11)} [${r.periodType}] ${r.sourceName.slice(0, 22).padEnd(22)} ${v.metricCode.padEnd(18)} = ${val.toLocaleString()} (${rawROE}%eq) unit=${v.unit} /1000=${fixed.toLocaleString()} (${fixROE}%eq) "${(v.originalLabel ?? '').slice(0, 25)}"`)
      }
    }
  }
}
await db.$disconnect()
