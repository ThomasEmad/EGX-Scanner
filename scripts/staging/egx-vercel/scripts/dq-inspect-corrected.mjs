import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const v = await db.financialValue.findFirst({ where: { isManuallyCorrected: true }, select: { metricCode: true, value: true, normalizedValue: true, originalValue: true, unit: true, correctedBy: true, correctionReason: true, validationNotes: true, validationStatus: true } })
  console.log(v)
  const tealMismatch = await db.$queryRaw`
    SELECT COUNT(*) AS n FROM FinancialValue teal
    JOIN FinancialValue a ON a.reportId = teal.reportId AND a.metricCode = 'TOTAL_ASSETS' AND a.subPeriod = teal.subPeriod
    WHERE teal.metricCode = 'TOTAL_EQUITY_AND_LIABILITIES' AND teal.validationStatus = 'VALID'
      AND a.validationStatus = 'VALID' AND ABS(teal.normalizedValue - a.normalizedValue) > MAX(ABS(a.normalizedValue) * 0.01, 1000000)
  `
  console.log("TEAL mismatches >1%:", tealMismatch)
} finally { await db.$disconnect() }
