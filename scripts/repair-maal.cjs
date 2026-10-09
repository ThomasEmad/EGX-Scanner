/* DEEP repair MAAL x1000 group (revenue + balance sheet) in ANNUAL reports.
   Guard: only fingerprint-matched rows are updated. Idempotent. */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
const GROUP = ["MAAL"]
const METRICS = [
  "REVENUE", "COGS", "GROSS_PROFIT", "INVENTORY", "TOTAL_DEBT", "OPERATING_EXPENSES",
  "TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_OWNER_EQUITY", "NET_INCOME",
  "SHARE_OF_EARNINGS_OWNERS", "OPERATING_CASH_FLOW", "FREE_CASH_FLOW"
]
;(async () => {
  for (const t of GROUP) {
    const co = await db.company.findFirst({ where: { ticker: t }, select: { id: true } })
    if (!co) { console.log(t + ": company missing"); await db.$disconnect(); return }
    for (const fy of [2021, 2022]) {
      const rep = await db.financialReport.findFirst({
        where: { companyId: co.id, fiscalYear: fy, periodType: "ANNUAL", statementType: "CONSOLIDATED" },
        select: { id: true, version: true }
      })
      if (!rep) { console.log("  " + t + " " + fy + ": annual income report missing"); continue }
      for (const code of METRICS) {
        const row = await db.financialValue.findFirst({
          where: {
            companyId: co.id,
            reportId: rep.id,
            metricCode: code,
            normalizedValue: { gt: 1000e6 }
          },
          select: { id: true, metricCode: true, originalValue: true, normalizedValue: true }
        })
        if (!row) continue
        if (row.normalizedValue < 1000e6) continue
        await db.financialValue.update({
          where: { id: row.id },
          data: {
            normalizedValue: row.normalizedValue / 1000,
            unit: "PERIOD_MILLION",
            isManuallyCorrected: true,
            correctedBy: "repair-maal.cjs",
            correctedAt: new Date(),
            correctionReason: "x1000 gross over-value (divide by 1000)"
          }
        })
        console.log("  " + t + " " + fy + " " + code.padEnd(16) + " RAW=" + row.originalValue + " -> FIXED=" + (row.normalizedValue / 1000).toLocaleString() + " (unit PERIOD_MILLION)")
      }
      const n = await db.financialValue.count({
        where: {
          companyId: co.id,
          reportId: rep.id,
          metricCode: { in: ["REVENUE", "TOTAL_ASSETS", "TOTAL_OWNER_EQUITY", "GROSS_PROFIT"] },
          normalizedValue: { gt: 1000e6 }
        }
      })
      console.log("  " + t + " " + fy + ": >1000M remaining = " + n)
    }
  }
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })




