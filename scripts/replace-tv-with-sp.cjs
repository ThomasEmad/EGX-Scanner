/* Second pass: where a TV-quarterly value contradicts the name-verified S&P
   value by >20%, replace it (TradingView quarterly has proven wrong for banks
   and several others — COMI 12,040 vs 35,331 user-verified). Only touches the
   16 companies whose S&P data was name-verified per fetch.
   Usage: node scripts/replace-tv-with-sp.cjs        (dry run)
          APPLY=1 node scripts/replace-tv-with-sp.cjs */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
const APPLY = process.env.APPLY === "1"

const DATA = [
  ["QNBE", "Q2 2026", "REVENUE", 16962e6], ["QNBE", "Q2 2026", "NET_PROFIT", 9079e6],
  ["QNBE", "Q1 2026", "REVENUE", 14764e6], ["QNBE", "Q1 2026", "NET_PROFIT", 6911e6],
  ["TMGH", "Q2 2026", "REVENUE", 17121e6], ["TMGH", "Q2 2026", "NET_PROFIT", 3318e6],
  ["TMGH", "Q1 2026", "REVENUE", 13071e6], ["TMGH", "Q1 2026", "NET_PROFIT", 4148e6],
  ["MASR", "Q2 2026", "REVENUE", 2384e6], ["MASR", "Q1 2026", "REVENUE", 2751e6],
  ["EAST", "Q2 2026", "REVENUE", 12007e6], ["EAST", "Q2 2026", "NET_PROFIT", 2901e6],
  ["JUFO", "Q2 2026", "REVENUE", 9078e6], ["JUFO", "Q2 2026", "NET_PROFIT", 712.91e6],
  ["ETEL", "Q2 2026", "REVENUE", 31005e6], ["ETEL", "Q2 2026", "NET_PROFIT", 11830e6],
  ["ETEL", "Q1 2026", "REVENUE", 28211e6],
  ["CLHO", "Q2 2026", "REVENUE", 2337e6],
  ["SKPC", "Q2 2026", "REVENUE", 4747e6], ["SKPC", "Q2 2026", "NET_PROFIT", 323.24e6],
  ["LCSW", "Q2 2026", "REVENUE", 2433e6],
  ["SWDY", "Q2 2026", "REVENUE", 88017e6], ["SWDY", "Q2 2026", "NET_PROFIT", 4376e6],
  ["ORHD", "Q2 2026", "REVENUE", 8358e6], ["ORHD", "Q2 2026", "NET_PROFIT", 1235e6],
  ["EMFD", "Q2 2026", "REVENUE", 4316e6], ["EMFD", "Q2 2026", "NET_PROFIT", -2213e6],
  ["CIRA", "Q2 2026", "REVENUE", 1571e6], ["CIRA", "Q2 2026", "NET_PROFIT", 338.4e6],
  ["ADIB", "Q2 2026", "REVENUE", 7192e6], ["ADIB", "Q2 2026", "NET_PROFIT", 3882e6],
  ["PHDC", "Q2 2026", "REVENUE", 10182e6], ["PHDC", "Q2 2026", "NET_PROFIT", 1060e6],
]

;(async () => {
  let replaced = 0
  const log = []
  for (const [ticker, label, code, spValue] of DATA) {
    const c = await db.company.findUnique({ where: { ticker }, select: { id: true } })
    if (!c) continue
    const report = await db.financialReport.findFirst({
      where: { companyId: c.id, periodType: "QUARTERLY", periodLabel: label, statementType: "CONSOLIDATED" },
      select: { id: true, sourceName: true },
    })
    if (!report) continue
    const existing = await db.financialValue.findFirst({ where: { reportId: report.id, metricCode: code }, select: { id: true, normalizedValue: true, originalLabel: true } })
    if (!existing) continue
    if (Math.abs(existing.normalizedValue - spValue) / Math.abs(spValue) <= 0.2) continue
    if (!/TradingView|TRADINGVIEW|DERIVED/i.test(existing.originalLabel) && !/TradingView/i.test(report.sourceName)) continue // replace TV-sourced AND derived-from-mislabeled-H1 values
    if (APPLY) {
      await db.financialValue.delete({ where: { id: existing.id } })
      await db.financialValue.create({
        data: {
          companyId: c.id, reportId: report.id, metricCode: code,
          originalLabel: `${code === "REVENUE" ? "Revenue" : "Net Income"} (S&P Global via stockanalysis.com — replaced TradingView ${Math.round(existing.normalizedValue / 1e6)}M)`,
          value: spValue, currency: "EGP", unit: "UNIT", statementType: "CONSOLIDATED",
          extractionMethod: "MANUAL_ENTRY", normalizedValue: spValue, validationStatus: "VALID",
        },
      })
      await db.auditLog.create({ data: { actor: "system", action: "REVIEW_EDIT", entityType: "FinancialValue", details: `${ticker} ${label} ${code}: replaced TradingView ${Math.round(existing.normalizedValue / 1e6)}M with S&P Global ${Math.round(spValue / 1e6)}M (diff ${Math.round(Math.abs(existing.normalizedValue - spValue) / Math.abs(spValue) * 100)}%).` } })
    }
    replaced++
    log.push(`${ticker} ${label} ${code}: ${Math.round(existing.normalizedValue / 1e6)}M -> ${Math.round(spValue / 1e6)}M`)
  }
  console.log(JSON.stringify({ applied: APPLY, replaced }))
  for (const l of log) console.log(" ", l)
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
