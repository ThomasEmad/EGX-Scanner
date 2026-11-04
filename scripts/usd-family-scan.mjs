// USD-stored-as-EGP family scan: Yahoo/Reuters annual reports whose equity is
// implausibly small vs market cap (P/B > 25) — candidates for USD magnitude.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const rows = await db.$queryRawUnsafe(`
  WITH mc AS (
    SELECT companyId, MAX(value) AS marketCap FROM CalculatedMetric
    WHERE code = 'market_cap' AND "valueStatus" = 'OK' AND value IS NOT NULL GROUP BY companyId
  ), eq AS (
    SELECT r.companyId, r."fiscalYear", r."sourceName", MAX(v."normalizedValue") AS equity
    FROM FinancialReport r JOIN FinancialValue v ON v.reportId = r.id
    WHERE r."deletedAt" IS NULL AND r."periodType" = 'ANNUAL' AND v.metricCode = 'TOTAL_EQUITY'
      AND v."validationStatus" = 'VALID' AND v."normalizedValue" IS NOT NULL AND r."fiscalYear" >= 2024
      AND (v.validationNotes IS NULL OR v.validationNotes NOT LIKE 'AUDIT_QUARANTINE%')
    GROUP BY r.companyId, r."fiscalYear", r."sourceName"
  )
  SELECT c.ticker, c."nameEn", eq."fiscalYear" AS fy, eq.equity, mc.marketCap, eq."sourceName" AS src
  FROM eq JOIN mc ON mc.companyId = eq.companyId JOIN Company c ON c.id = eq.companyId
  WHERE mc.marketCap / NULLIF(eq.equity, 0) > 25 AND c."isActive" = 1
  ORDER BY mc.marketCap / NULLIF(eq.equity, 0) DESC`)

console.log(`candidates: ${rows.length}`)
for (const r of rows) {
  const pb = Number(r.marketCap) / Number(r.equity)
  const pbIfUsd = pb / 48
  console.log(`${r.ticker} FY${r.fiscalYear}: equity=${Number(r.equity).toLocaleString()} mcap=${Number(r.marketCap).toLocaleString()} P/B=${pb.toFixed(1)} (if USD: ${(pbIfUsd).toFixed(1)}) src=${r.src.slice(0, 30)}`)
}
await db.$disconnect()
