import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const rows = await db.financialValue.findMany({
    where: { company: { ticker: "FWRY" }, report: { periodLabel: "FY 2016" } },
    select: { metricCode: true, value: true, normalizedValue: true, unit: true, originalValue: true, isManuallyCorrected: true, correctedBy: true, correctionReason: true, validationNotes: true, validationStatus: true, subPeriod: true },
    orderBy: { metricCode: "asc" },
  })
  for (const r of rows) console.log(r.metricCode.padEnd(32), r.normalizedValue.toExponential(3), r.unit, "orig", r.originalValue?.toExponential(3) ?? "-", r.isManuallyCorrected, r.correctedBy ?? "-", (r.correctionReason ?? "").slice(0, 50), r.validationStatus, r.subPeriod)
} finally { await db.$disconnect() }
