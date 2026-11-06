import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const s = await db.financialValue.groupBy({ by: ["validationStatus"], _count: { _all: true } })
  console.log("status:", s)
  const pending = await db.financialValue.findMany({ where: { validationStatus: "PENDING" }, take: 5, select: { metricCode: true, normalizedValue: true, originalLabel: true } })
  console.log("pending samples:", pending)
} finally { await db.$disconnect() }
