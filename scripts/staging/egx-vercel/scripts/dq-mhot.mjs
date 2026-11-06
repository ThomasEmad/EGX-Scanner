import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const rows = await db.financialValue.findMany({
    where: { company: { ticker: "MHOT" }, metricCode: { in: ["TOTAL_ASSETS", "TOTAL_EQUITY_AND_LIABILITIES"] }, report: { periodLabel: "FY 2022" } },
    select: { metricCode: true, value: true, normalizedValue: true, unit: true, originalValue: true, isManuallyCorrected: true, correctedBy: true, correctionReason: true, validationNotes: true, validationStatus: true, subPeriod: true },
  })
  console.log(rows)
} finally { await db.$disconnect() }
