import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const byStatus = await db.$queryRawUnsafe(`SELECT "validationStatus" AS s, COUNT(*) AS n FROM FinancialValue GROUP BY "validationStatus" ORDER BY COUNT(*) DESC`)
console.log('--- by status:')
for (const r of byStatus) console.log(`  ${r.s}: ${Number(r.n)}`)
const byCorrected = await db.$queryRawUnsafe(`SELECT "correctedBy" AS cb, COUNT(*) AS n FROM FinancialValue WHERE "correctedBy" IS NOT NULL GROUP BY "correctedBy" ORDER BY COUNT(*) DESC`)
console.log('--- by correctedBy:')
for (const r of byCorrected) console.log(`  ${r.cb}: ${Number(r.n)}`)
const byCompany = await db.$queryRawUnsafe(`
  SELECT c.ticker, COUNT(*) AS n FROM FinancialValue v
  JOIN FinancialReport r ON r.id = v.reportId AND r."deletedAt" IS NULL
  JOIN Company c ON c.id = r.companyId
  WHERE v."validationStatus" = 'CORRECTED' GROUP BY c.ticker ORDER BY COUNT(*) DESC LIMIT 15`)
console.log('--- CORRECTED by company (top 15):')
for (const r of byCompany) console.log(`  ${r.ticker}: ${Number(r.n)}`)
await db.$disconnect()
