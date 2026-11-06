// Market-wide scan for P&L values that are absurd vs the company's balance
// sheet (the UBEE x1000 family): |flow| > 3x max sane TOTAL_ASSETS.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const FLOW = ['NET_PROFIT', 'NET_PROFIT_PARENT', 'REVENUE', 'GROSS_PROFIT', 'OPERATING_INCOME', 'EBITDA', 'OPERATING_CASH_FLOW']
const byCompany = await db.$queryRawUnsafe(`
  SELECT c.id, c.ticker,
         MAX(CASE WHEN v.metricCode = 'TOTAL_ASSETS' THEN v."normalizedValue" END) AS maxAssets,
         MAX(CASE WHEN v.metricCode IN (${FLOW.map(() => '?').join(',')}) THEN v."normalizedValue" END) AS maxFlow
  FROM FinancialValue v
  JOIN FinancialReport r ON r.id = v.reportId AND r."deletedAt" IS NULL
  JOIN Company c ON c.id = r.companyId
  WHERE v."validationStatus" = 'VALID' AND v."normalizedValue" IS NOT NULL AND v."normalizedValue" > 0
    AND (v.validationNotes IS NULL OR v.validationNotes NOT LIKE 'AUDIT_QUARANTINE%')
  GROUP BY c.id, c.ticker
`, ...FLOW)

const hits = byCompany.filter(r => r.maxAssets && r.maxFlow && Number(r.maxFlow) > 3 * Number(r.maxAssets))
console.log(`companies with |flow| > 3x assets: ${hits.length}`)
for (const h of hits) {
  console.log(`  ${h.ticker}: maxFlow=${Number(h.maxFlow).toLocaleString()} maxAssets=${Number(h.maxAssets).toLocaleString()} ratio=${(Number(h.maxFlow) / Number(h.maxAssets)).toFixed(0)}x`)
}
await db.$disconnect()
