// Audit: what fundamentals coverage does ABUK (and the whole DB) actually have?
import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()

const ticker = process.argv[2] || "ABUK"
const c = await db.company.findUnique({ where: { ticker } })
if (!c) { console.log("no company", ticker); process.exit(1) }

const reports = await db.financialReport.findMany({
  where: { companyId: c.id, deletedAt: null, isDemoData: false },
  select: { id: true, periodType: true, periodLabel: true, fiscalYear: true, periodEnd: true, statementType: true, processingStatus: true, sourceName: true },
  orderBy: [{ periodEnd: "desc" }],
})
console.log(`=== ${ticker} — ${reports.length} reports ===`)
for (const r of reports.slice(0, 40)) {
  const vals = await db.financialValue.findMany({
    where: { reportId: r.id },
    select: { metricCode: true, normalizedValue: true },
  })
  console.log(`${r.periodLabel.padEnd(10)} ${r.periodType.padEnd(9)} ${r.statementType.padEnd(12)} [${r.sourceName}] metrics(${vals.length}): ${vals.map(v => v.metricCode).join(",")}`)
}

// Global coverage: distinct metricCode counts per periodType across all active companies
console.log("\n=== GLOBAL: distinct metrics per company (quarterly, consolidated, last 8 quarters) ===")
const active = await db.company.findMany({ where: { isActive: true }, select: { id: true, ticker: true } })
const from = new Date("2023-01-01")
const metricSpread = new Map()
let sparse = 0, rich = 0
for (const comp of active) {
  const rs = await db.financialReport.findMany({
    where: { companyId: comp.id, deletedAt: null, periodType: "QUARTERLY", statementType: "CONSOLIDATED", periodEnd: { gte: from } },
    select: { id: true },
  })
  if (rs.length === 0) { metricSpread.set("NO_Q", (metricSpread.get("NO_Q") || 0) + 1); sparse++; continue }
  const codes = new Set()
  for (const r of rs) {
    const vals = await db.financialValue.findMany({ where: { reportId: r.id }, select: { metricCode: true } })
    for (const v of vals) codes.add(v.metricCode)
  }
  if (codes.size <= 3) sparse++; else rich++
  const key = [...codes].sort().join(",")
  metricSpread.set(key, (metricSpread.get(key) || 0) + 1)
}
console.log(`active=${active.length} sparse(≤3 metrics)=${sparse} rich(>3)=${rich}`)
const sorted = [...metricSpread.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
for (const [k, n] of sorted) console.log(`n=${n}  ${k.slice(0, 200)}`)

await db.$disconnect()
