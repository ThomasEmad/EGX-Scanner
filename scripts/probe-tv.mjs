// Probe TradingView endpoints for EGX fundamentals history (ABUK as guinea pig)
const SYM = "EGX:ABUK"

async function tryScan(body, label) {
  try {
    const res = await fetch("https://scanner.tradingview.com/egypt/scan", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    console.log(`\n### ${label} → HTTP ${res.status}`)
    console.log(text.slice(0, 1200))
    return { status: res.status, text }
  } catch (e) {
    console.log(`\n### ${label} → ERROR ${e.message}`)
    return { status: 0, text: "" }
  }
}

// 1) snapshot fundamental fields availability
await tryScan({
  symbols: { tickers: [SYM] },
  columns: ["name", "total_revenue_fq", "total_revenue_fy", "net_income_fq", "gross_profit_fq", "total_assets_fq", "total_equity_fq", "free_cash_flow_fq", "cash_from_operating_activities_fq", "ebitda_fq", "earnings_per_share_basic_fq", "total_debt_fq", "current_assets_fq", "current_liabilities_fq", "total_common_shares_outstanding", "update_mode"],
}, "1) snapshot *_fq fields")

// 2) history-array column syntax
await tryScan({
  symbols: { tickers: [SYM] },
  columns: ["name", ["total_revenue_fq", 8]],
}, "2) columns [field, N] history syntax")

// 3) symbol fields endpoint
try {
  const res = await fetch(`https://scanner.tradingview.com/symbol?symbol=${encodeURIComponent(SYM)}&fields=name,market,description,total_revenue_fq&no_404=true`, {
    headers: { "user-agent": "Mozilla/5.0" },
  })
  console.log(`\n### 3) scanner symbol endpoint → HTTP ${res.status}`)
  console.log((await res.text()).slice(0, 600))
} catch (e) { console.log("### 3) ERROR", e.message) }

// 4) tradingview.com financials internal endpoint guesses
const guesses = [
  `https://scanner.tradingview.com/api/v1/financials?symbol=${encodeURIComponent(SYM)}&statement=income&period=quarterly`,
  `https://scanner.tradingview.com/api/v1/symbol/financials?symbol=${encodeURIComponent(SYM)}&period=quarterly`,
]
for (const [i, url] of guesses.entries()) {
  try {
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } })
    console.log(`\n### 4.${i}) ${url} → HTTP ${res.status}`)
    console.log((await res.text()).slice(0, 300))
  } catch (e) { console.log(`### 4.${i}) ERROR ${e.message}`) }
}
