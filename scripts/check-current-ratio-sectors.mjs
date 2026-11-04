// Do Banks/Insurance reports carry CURRENT_ASSETS/CURRENT_LIABILITIES at all,
// and which sectors produce OK current_ratio rows?
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const bySector = await db.$queryRawUnsafe(`
  SELECT c.sector AS sector,
         COUNT(*) FILTER (WHERE v.metricCode = 'CURRENT_ASSETS') AS ca,
         COUNT(*) FILTER (WHERE v.metricCode = 'CURRENT_LIABILITIES') AS cl
  FROM FinancialValue v
  JOIN FinancialReport r ON r.id = v.reportId AND r."deletedAt" IS NULL
  JOIN Company c ON c.id = r.companyId
  WHERE v.metricCode IN ('CURRENT_ASSETS','CURRENT_LIABILITIES')
    AND v."validationStatus" = 'VALID' AND v."normalizedValue" IS NOT NULL
  GROUP BY c.sector ORDER BY ca DESC
`)
console.log('CURRENT_* VALID values by sector:')
for (const r of bySector) console.log(`  ${r.sector}: CA=${Number(r.ca)} CL=${Number(r.cl)}`)

const ratios = await db.$queryRawUnsafe(`
  SELECT c.sector AS sector, COUNT(*) AS n
  FROM CalculatedMetric cm JOIN Company c ON c.id = cm.companyId
  WHERE cm.code = 'current_ratio' AND cm."valueStatus" = 'OK'
  GROUP BY c.sector ORDER BY n DESC
`)
console.log('\nOK current_ratio rows by sector:')
for (const r of ratios) console.log(`  ${r.sector}: ${Number(r.n)}`)
await db.$disconnect()
