// Dump FinancialValue rows for one ticker's quarterly reports with provenance,
// and test discrete-vs-cumulative identity against annuals.
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const ticker = (process.argv[2] ?? "ABUK").toUpperCase()

const company = await db.company.findFirst({ where: { ticker }, select: { id: true, ticker: true } })
if (!company) { console.log("no company"); process.exit(1) }

const reports = await db.financialReport.findMany({
  where: { companyId: company.id, deletedAt: null, isDemoData: false },
  orderBy: [{ periodEnd: "asc" }],
  select: {
    id: true, periodType: true, periodLabel: true, periodEnd: true,
    values: { select: { metricCode: true, normalizedValue: true, subPeriod: true, validationNotes: true, sourceText: true, extractionMethod: true } },
  },
})

// 1. where did Q1 2026 REVENUE come from?
const q1_2026 = reports.find(r => r.periodLabel === "Q1 2026")
if (q1_2026) {
  console.log("=== Q1 2026 values (with provenance) ===")
  for (const v of q1_2026.values) {
    console.log(`  ${v.metricCode} = ${v.normalizedValue}  src=${v.sourceText?.slice(0, 80)}  notes=${v.validationNotes?.slice(0, 120)}`)
  }
}

// 2. discrete identity test per fiscal year for NP/GP using DB quarterly values
console.log("\n=== discrete identity test (Q1+Q2+Q3+Q4 ?= FY) ===")
for (const metric of ["NET_PROFIT", "GROSS_PROFIT", "OPERATING_CASH_FLOW"]) {
  for (const fy of [2022, 2023, 2024, 2025]) {
    const vals = {}
    for (const label of [`Q1 ${fy}`, `Q2 ${fy}`, `Q3 ${fy}`, `Q4 ${fy}`, `FY ${fy}`]) {
      const r = reports.find(x => x.periodLabel === label)
      if (!r) continue
      const v = r.values.find(x => x.metricCode === metric && (x.subPeriod === "CURRENT" || x.subPeriod === null))
      if (v) vals[label.slice(0, 2)] = v.normalizedValue
    }
    const q = ["Q1", "Q2", "Q3", "Q4"].map(k => vals[k])
    const all = q.every(x => x !== undefined)
    const sum = all ? q.reduce((a, b) => a + b, 0) : null
    const fyV = vals.FY
    const tag = all && fyV ? (Math.abs(sum - fyV) <= Math.max(Math.abs(fyV) * 0.05, 1e6) ? "SUM_OK(discrete)" : `SUM_OFF(gap=${((sum - fyV) / 1e6).toFixed(0)}M)`) : "incomplete"
    console.log(`  ${metric} ${fy}: ${JSON.stringify(vals)} → ${tag}`)
  }
}

await db.$disconnect()
