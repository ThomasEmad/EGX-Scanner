/* Import AskBorsa annual data for companies with verified gaps.
   ONLY companies whose values were actually read off AskBorsa pages (MHOT/GPIM/TYCN).
   Only-missing-slot policy: existing values are never overwritten. */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()

// [ticker, fyLabel, periodEnd, {metric: valueInEGP}]
const DATA = [
  // MHOT — Misr Hotels (FY starts July, so FY2025 ends June 2025)
  ["MHOT", "FY 2025", "2025-06-30", { NET_PROFIT: 1.39e9, GROSS_PROFIT: 1.78e9, TOTAL_ASSETS: 6.15e9, TOTAL_LIABILITIES: 2.78e9, TOTAL_EQUITY: 3.37e9, OPERATING_CASH_FLOW: 1.38e9, INVESTING_CASH_FLOW: -11.17e6, FINANCING_CASH_FLOW: -604e6, NET_CHANGE_IN_CASH: 761e6 }],
  ["MHOT", "FY 2024", "2024-06-30", { NET_PROFIT: 1.45e9, GROSS_PROFIT: 1.32e9, TOTAL_ASSETS: 3.27e9, TOTAL_LIABILITIES: 761e6, TOTAL_EQUITY: 2.51e9, OPERATING_CASH_FLOW: 872e6, INVESTING_CASH_FLOW: 110e6, FINANCING_CASH_FLOW: -1.25e9, NET_CHANGE_IN_CASH: -265e6 }],
  ["MHOT", "FY 2023", "2023-06-30", { NET_PROFIT: 820e6, GROSS_PROFIT: 893e6, TOTAL_ASSETS: 2.82e9, TOTAL_LIABILITIES: 1.3e9, TOTAL_EQUITY: 1.51e9, OPERATING_CASH_FLOW: 674e6, INVESTING_CASH_FLOW: -15.31e6, FINANCING_CASH_FLOW: -234e6, NET_CHANGE_IN_CASH: 425e6 }],
  ["MHOT", "FY 2022", "2022-06-30", { NET_PROFIT: 351e6, GROSS_PROFIT: 460e6, TOTAL_ASSETS: 2.03e9, TOTAL_LIABILITIES: 1.19e9, TOTAL_EQUITY: 839e6, OPERATING_CASH_FLOW: 396e6, INVESTING_CASH_FLOW: -66.61e6, FINANCING_CASH_FLOW: -73.34e6, NET_CHANGE_IN_CASH: 256e6 }],
  // FY2021 GP omitted: AskBorsa shows 8.27K which fails sanity for a hotel group

  // GPIM — GPI For Urban Growth (Dec FY)
  ["GPIM", "FY 2024", "2024-12-31", { NET_PROFIT: 15e6, GROSS_PROFIT: 11.71e6, TOTAL_ASSETS: 230e6, TOTAL_LIABILITIES: 58.98e6, TOTAL_EQUITY: 171e6, OPERATING_CASH_FLOW: -76.11e6, INVESTING_CASH_FLOW: 12.62e6, FINANCING_CASH_FLOW: 99.32e6, NET_CHANGE_IN_CASH: 35.83e6 }],
  ["GPIM", "FY 2023", "2023-12-31", { NET_PROFIT: 1.04e6, GROSS_PROFIT: 4.12e6, TOTAL_ASSETS: 66.11e6, TOTAL_LIABILITIES: 9.78e6, TOTAL_EQUITY: 56.33e6, OPERATING_CASH_FLOW: 2.98e6, INVESTING_CASH_FLOW: 133e3, FINANCING_CASH_FLOW: 53.87e3, NET_CHANGE_IN_CASH: 3.17e6 }],
  ["GPIM", "FY 2022", "2022-12-31", { NET_PROFIT: 2.21e6, GROSS_PROFIT: 4.02e6, TOTAL_ASSETS: 64.58e6, TOTAL_LIABILITIES: 8.78e6, TOTAL_EQUITY: 55.8e6, OPERATING_CASH_FLOW: 4.05e6, INVESTING_CASH_FLOW: -1.96e6, FINANCING_CASH_FLOW: -501e3, NET_CHANGE_IN_CASH: 1.59e6 }],
  ["GPIM", "FY 2021", "2021-12-31", { NET_PROFIT: 305e3, GROSS_PROFIT: 1.77e6, TOTAL_ASSETS: 63.36e6, TOTAL_LIABILITIES: 9.82e6, TOTAL_EQUITY: 53.54e6, OPERATING_CASH_FLOW: 2.2e6, INVESTING_CASH_FLOW: -2.2e6, FINANCING_CASH_FLOW: -1.11e6, NET_CHANGE_IN_CASH: -1.11e6 }],

  // TYCN — Tycoon Holding (Dec FY)
  ["TYCN", "FY 2024", "2024-12-31", { NET_PROFIT: 939e3, TOTAL_ASSETS: 10.06e6, TOTAL_LIABILITIES: 1.2e6, TOTAL_EQUITY: 8.86e6, OPERATING_CASH_FLOW: 310e3, INVESTING_CASH_FLOW: 3.42e3, FINANCING_CASH_FLOW: -225e3, NET_CHANGE_IN_CASH: 88.74e3 }],
  ["TYCN", "FY 2023", "2023-12-31", { NET_PROFIT: 38.91e3, TOTAL_ASSETS: 8.5e6, TOTAL_LIABILITIES: 587e3, TOTAL_EQUITY: 7.91e6, OPERATING_CASH_FLOW: 18.15e3, NET_CHANGE_IN_CASH: 18.15e3 }],
  ["TYCN", "FY 2022", "2022-12-31", { NET_PROFIT: -2.96e6, TOTAL_ASSETS: 10.31e6, TOTAL_LIABILITIES: 569e3, TOTAL_EQUITY: 9.75e6, OPERATING_CASH_FLOW: 72.3e3, INVESTING_CASH_FLOW: 1.44e3, NET_CHANGE_IN_CASH: 73.74e3 }],
  ["TYCN", "FY 2021", "2021-12-31", { NET_PROFIT: -3.19e6, TOTAL_ASSETS: 12.87e6, TOTAL_LIABILITIES: 154e3, TOTAL_EQUITY: 12.72e6, OPERATING_CASH_FLOW: -3.86e6, INVESTING_CASH_FLOW: 588e3, NET_CHANGE_IN_CASH: -3.28e6 }],
]

// sanity gate: balance-sheet identity TA = TL + SE (±2%)
function sanity(vals) {
  const { TOTAL_ASSETS: ta, TOTAL_LIABILITIES: tl, TOTAL_EQUITY: se } = vals
  if (ta && tl != null && se != null) {
    const gap = Math.abs(ta - (tl + se)) / Math.abs(ta)
    if (gap > 0.02) return `BS identity off by ${(gap * 100).toFixed(1)}%`
  }
  return null
}

;(async () => {
  let created = 0, added = 0, skipped = 0
  const rejected = []
  for (const [ticker, label, periodEnd, metrics] of DATA) {
    const prob = sanity(metrics)
    if (prob) { rejected.push(`${ticker} ${label}: ${prob}`); continue }
    const c = await db.company.findUnique({ where: { ticker }, select: { id: true } })
    if (!c) { rejected.push(`${ticker}: unknown`); continue }
    let report = await db.financialReport.findFirst({
      where: { companyId: c.id, periodType: "ANNUAL", periodLabel: label, statementType: "CONSOLIDATED" },
      select: { id: true },
    })
    if (!report) {
      try {
        report = await db.financialReport.create({ data: { companyId: c.id, reportType: "ANNUAL", periodType: "ANNUAL", periodLabel: label, fiscalYear: Number(label.split(" ")[1]), periodEnd: new Date(periodEnd), statementType: "CONSOLIDATED", processingStatus: "APPROVED", sourceName: "ASKBORA_SUMMARY", version: 1 } })
        created++
      } catch (e) {
        if (e.code === "P2002") report = await db.financialReport.findFirst({ where: { companyId: c.id, periodType: "ANNUAL", periodLabel: label, statementType: "CONSOLIDATED" }, select: { id: true } })
        else throw e
      }
    }
    const have = new Set((await db.financialValue.findMany({ where: { reportId: report.id }, select: { metricCode: true } })).map(v => v.metricCode))
    for (const [code, value] of Object.entries(metrics)) {
      if (have.has(code)) { skipped++; continue }
      await db.financialValue.create({ data: { companyId: c.id, reportId: report.id, metricCode: code, originalLabel: `${code} (AskBorsa annual)`, value, currency: "EGP", unit: "UNIT", statementType: "CONSOLIDATED", extractionMethod: "MANUAL_ENTRY", normalizedValue: value, validationStatus: "VALID" } })
      have.add(code); added++
    }
  }
  console.log(JSON.stringify({ reportsCreated: created, valuesAdded: added, existingPreserved: skipped, rejected }, null, 2))
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
