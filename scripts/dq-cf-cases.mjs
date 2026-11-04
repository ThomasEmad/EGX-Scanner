import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const targets = [["ATQA", "FY 2024"], ["COSG", "FY 2023"], ["COSG", "FY 2024"], ["MAAL", "FY 2023"], ["MBSC", "FY 2021"], ["EGAS", "FY 2022"], ["DSCW", "FY 2024"], ["ASCM", "FY 2023"]]
const CODES = ["OPERATING_CASH_FLOW", "INVESTING_CASH_FLOW", "FINANCING_CASH_FLOW", "FX_EFFECT_CASH", "NET_CHANGE_IN_CASH", "OPENING_CASH", "CLOSING_CASH"]
try {
  for (const [ticker, label] of targets) {
    const co = await db.company.findFirst({ where: { ticker } })
    const reps = await db.financialReport.findMany({
      where: { companyId: co.id, periodLabel: label, deletedAt: null },
      select: { sourceName: true, values: { where: { metricCode: { in: CODES }, subPeriod: "CURRENT" }, select: { metricCode: true, normalizedValue: true, validationStatus: true } } },
    })
    console.log(`\n===== ${ticker} ${label} =====`)
    for (const r of reps) {
      console.log("  --", r.sourceName)
      for (const v of r.values) console.log("   ", v.metricCode.padEnd(26), Math.round(v.normalizedValue).toLocaleString().padStart(16), v.validationStatus)
    }
  }
} finally { await db.$disconnect() }
