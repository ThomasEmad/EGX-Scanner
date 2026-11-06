import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()

const targets = [
  ["RAKT", "FY 2021"], ["RAKT", "FY 2022"], ["RAKT", "FY 2023"], ["RAKT", "FY 2025"],
  ["UEGC", "FY 2021"], ["IRON", "FY 2019"], ["IRON", "FY 2020"], ["IRON", "FY 2013"],
  ["COPR", "FY 2022"], ["COPR", "FY 2024"], ["COSG", "FY 2021"], ["SIPC", "FY 2024"],
  ["ASCM", "FY 2021"],
]
const CODES = ["TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY", "TOTAL_EQUITY_AND_LIABILITIES", "NON_CONTROLLING_INTERESTS", "CURRENT_ASSETS", "NON_CURRENT_ASSETS", "CURRENT_LIABILITIES", "NON_CURRENT_LIABILITIES", "SHARE_CAPITAL", "RETAINED_EARNINGS"]

try {
  for (const [ticker, label] of targets) {
    const co = await db.company.findFirst({ where: { ticker } })
    const reps = await db.financialReport.findMany({
      where: { companyId: co.id, periodLabel: label, deletedAt: null },
      select: { id: true, sourceName: true, periodType: true, values: { where: { metricCode: { in: CODES }, subPeriod: "CURRENT" }, select: { metricCode: true, normalizedValue: true, validationStatus: true, originalLabel: true } } },
    })
    console.log(`\n===== ${ticker} ${label} (${reps.length} reports) =====`)
    for (const r of reps) {
      console.log(`  -- ${r.sourceName} ${r.periodType}`)
      for (const v of r.values.sort((a, b) => a.metricCode.localeCompare(b.metricCode))) {
        console.log("   ", v.metricCode.padEnd(32), Math.round(v.normalizedValue).toLocaleString().padStart(16), v.validationStatus.padEnd(12), JSON.stringify(v.originalLabel).slice(1, 70))
      }
    }
  }
} finally { await db.$disconnect() }
