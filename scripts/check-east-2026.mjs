import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const c = await db.company.findUnique({ where: { ticker: "EAST" }, select: { id: true } })
  const rows = await db.calculatedMetric.findMany({ where: { companyId: c.id, code: { in: ["net_profit","revenue","roe"] }, fiscalYear: 2026 }, select: { code: true, value: true, periodType: true, periodLabel: true, valueStatus: true } })
  console.log(rows.map(r=>`${r.code} ${r.periodType} ${r.periodLabel}=${r.value}(${r.valueStatus})`).join("\n") || "no 2026 calculated metrics")
  const reps = await db.financialReport.findMany({ where: { companyId: c.id, fiscalYear: 2026 }, select: { periodType: true, periodLabel: true, periodEnd: true, values: { where: { metricCode: { in: ["NET_PROFIT","REVENUE"] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true } } } })
  console.log("reports:", reps.map(r=>`${r.periodType} ${r.periodLabel} end=${r.periodEnd?.toISOString().slice(0,10)} ${r.values.map(v=>`${v.metricCode}=${v.normalizedValue}(${v.validationStatus})`).join(",")}`).join(" | "))
} finally { await db.$disconnect() }
