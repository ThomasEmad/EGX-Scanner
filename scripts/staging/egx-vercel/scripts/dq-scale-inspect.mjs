import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  for (const ticker of ["MHOT", "FWRY", "ASPI", "COPR"]) {
    const co = await db.company.findFirst({ where: { ticker } })
    const reps = await db.financialReport.findMany({
      where: { companyId: co.id, deletedAt: null },
      orderBy: [{ fiscalYear: "asc" }, { periodLabel: "asc" }],
      select: { periodLabel: true, periodType: true, sourceName: true, values: { where: { metricCode: { in: ["TOTAL_ASSETS", "REVENUE", "NET_PROFIT", "TOTAL_EQUITY"] }, subPeriod: "CURRENT", validationStatus: "VALID" }, select: { metricCode: true, normalizedValue: true, unit: true, value: true } } },
    })
    console.log(`\n===== ${ticker} (${co.sector}) =====`)
    for (const r of reps) {
      if (r.values.length === 0) continue
      const m = Object.fromEntries(r.values.map(v => [v.metricCode, v]))
      const f = (c) => m[c] ? m[c].normalizedValue.toExponential(2) : "-"
      console.log(r.periodLabel.padEnd(9), r.periodType.padEnd(10), r.sourceName.slice(0, 24).padEnd(25), "A", f("TOTAL_ASSETS").padStart(10), "R", f("REVENUE").padStart(10), "NP", f("NET_PROFIT").padStart(10), "E", f("TOTAL_EQUITY").padStart(10))
    }
  }
} finally { await db.$disconnect() }
