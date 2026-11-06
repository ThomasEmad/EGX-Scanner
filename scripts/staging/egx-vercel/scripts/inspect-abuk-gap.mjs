// Inspect the current coverage of financial data for one ticker (default ABUK).
// Shows: reports by period, metrics per report, and latest data vs calendar.
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const ticker = (process.argv[2] ?? "ABUK").toUpperCase()

const company = await db.company.findFirst({
  where: { ticker },
  select: { id: true, ticker: true, nameAr: true, nameEn: true },
})
if (!company) { console.log("no company", ticker); process.exit(1) }
console.log("company:", JSON.stringify(company))

const reports = await db.financialReport.findMany({
  where: { companyId: company.id, deletedAt: null, isDemoData: false, processingStatus: { notIn: ["FAILED", "REJECTED", "DELETED"] } },
  orderBy: [{ periodEnd: "asc" }],
  select: {
    id: true, periodType: true, periodLabel: true, fiscalYear: true,
    periodStart: true, periodEnd: true, statementType: true, processingStatus: true,
    sourceName: true, extractionMethod: true, supersedesId: true,
    values: { select: { metricCode: true, normalizedValue: true, subPeriod: true } },
  },
})

const superseded = new Set(reports.map(r => r.supersedesId).filter(Boolean))
console.log(`\nreports: ${reports.length} (superseded: ${superseded.size})`)
for (const r of reports) {
  const flag = superseded.has(r.id) ? " [SUPERSEDED]" : ""
  const metrics = {}
  for (const v of r.values) {
    if (v.subPeriod !== "CURRENT" && v.subPeriod !== null) continue
    metrics[v.metricCode] = v.normalizedValue
  }
  const n = Object.keys(metrics).length
  console.log(`\n${r.periodType} | ${r.periodLabel} | end=${r.periodEnd?.toISOString?.().slice(0,10)} | ${r.statementType} | ${r.processingStatus} | src=${r.sourceName} | metrics=${n}${flag}`)
  const codes = Object.keys(metrics).sort().join(", ")
  console.log(`  → ${codes || "(none)"}`)
}

// distinct metrics across all reports
const all = new Set()
for (const r of reports) for (const v of r.values) if (v.subPeriod === "CURRENT" || v.subPeriod === null) all.add(v.metricCode)
console.log(`\ndistinct metrics ever reported: ${[...all].sort().join(", ")}`)

await db.$disconnect()
