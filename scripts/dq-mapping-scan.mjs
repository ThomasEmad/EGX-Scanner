import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()

const SUSPICIOUS = [
  ["TOTAL_DEBT", /net debt/i, "net debt = debt − cash, not gross total debt"],
  ["INVESTMENTS", /invested capital/i, "invested capital = debt + equity, not investments"],
  ["SHARE_CAPITAL", /total capitalization|market cap/i, "total capitalization ≠ share capital"],
  ["CASH_AND_EQUIVALENTS", /short.?term investments/i, "cash + short-term investments ≠ cash"],
  ["TOTAL_EQUITY", /liabilit/i, "liability line mapped to equity"],
  ["TOTAL_LIABILITIES", /equity/i, "equity line mapped to liabilities"],
  ["REVENUE", /cost of|cost of revenue/i, "cost line mapped to revenue"],
  ["COGS", /revenue|sales/i, "revenue line mapped to COGS"],
  ["GROSS_PROFIT", /net profit|net income/i, "net profit mapped to gross profit"],
  ["NET_PROFIT", /gross profit|operating income|ebit\b/i, "wrong profit line"],
  ["TOTAL_ASSETS", /liabilit|equity/i, "non-asset line mapped to assets"],
  ["OPERATING_CASH_FLOW", /investing|financing/i, "wrong cash-flow leg"],
  ["INVESTING_CASH_FLOW", /operating|financing/i, "wrong cash-flow leg"],
  ["FINANCING_CASH_FLOW", /operating|investing/i, "wrong cash-flow leg"],
  ["EBITDA", /^ebit$|operating income/i, "EBIT mapped to EBITDA"],
]

try {
  console.log("=== Suspicious metric/label mappings (DB-wide) ===")
  for (const [code, re, why] of SUSPICIOUS) {
    const rows = await db.financialValue.groupBy({
      by: ["originalLabel"],
      where: { metricCode: code, validationStatus: { not: "FAILED" } },
      _count: { _all: true },
    })
    const hits = rows.filter(r => re.test(r.originalLabel))
    if (hits.length === 0) continue
    const total = hits.reduce((a, r) => a + r._count._all, 0)
    console.log(`\n${code} ← suspicious labels (${total} values) — ${why}`)
    for (const h of hits.sort((a, b) => b._count._all - a._count._all).slice(0, 8)) {
      console.log("   ", String(h._count._all).padStart(5), JSON.stringify(h.originalLabel).slice(0, 110))
    }
  }

  console.log("\n\n=== All labels for key metrics (top 12 each) ===")
  const key = ["TOTAL_EQUITY", "TOTAL_LIABILITIES", "TOTAL_ASSETS", "TOTAL_DEBT", "REVENUE", "COGS", "GROSS_PROFIT", "NET_PROFIT", "OPERATING_CASH_FLOW", "INVESTMENTS", "SHARE_CAPITAL", "CASH_AND_EQUIVALENTS"]
  for (const code of key) {
    const rows = await db.financialValue.groupBy({ by: ["originalLabel"], where: { metricCode: code, validationStatus: "VALID" }, _count: { _all: true } })
    console.log(`\n${code} (${rows.reduce((a, r) => a + r._count._all, 0)} valid)`) 
    for (const r of rows.sort((a, b) => b._count._all - a._count._all).slice(0, 12)) console.log("   ", String(r._count._all).padStart(5), JSON.stringify(r.originalLabel).slice(0, 110))
  }
} finally { await db.$disconnect() }
