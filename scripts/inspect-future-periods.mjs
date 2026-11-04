import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const now = new Date()
const future = await db.financialReport.findMany({
  where: { periodEnd: { gt: now } },
  select: { id: true, company: { select: { ticker: true } }, periodLabel: true, periodType: true, fiscalYear: true, periodEnd: true, processingStatus: true, sourceName: true },
  orderBy: { periodEnd: "asc" },
  take: 100,
})
const futureCount = await db.financialReport.count({ where: { periodEnd: { gt: now } } })
const futureValid = await db.financialValue.count({ where: { validationStatus: "VALID", report: { periodEnd: { gt: now }, processingStatus: { in: ["VALIDATED", "APPROVED", "EXTRACTED"] } } } })
console.log(JSON.stringify({ now, futureCount, futureValid, future }, null, 2))
await db.$disconnect()
