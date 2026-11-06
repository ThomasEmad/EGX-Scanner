// Probe deeper: find TradingView's financials data endpoint
// 1) scan page HTML for embedded endpoints
async function fetchText(url, label) {
  try {
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } })
    const text = await res.text()
    console.log(`### ${label} → HTTP ${res.status} (${text.length} bytes)`)
    return text
  } catch (e) { console.log(`### ${label} → ERROR ${e.message}`); return "" }
}

const page = await fetchText("https://www.tradingview.com/symbols/EGX-ABUK/", "symbol page")
// look for financial-related URLs in the page
const urlMatches = [...page.matchAll(/https?:\/\/[a-z0-9.-]*tradingview\.com[^"'`\s)]*(financial|statement|fundamental|scanner|api)[^"'`\s)]*/gi)].map(m => m[0])
console.log([...new Set(urlMatches)].slice(0, 25).join("\n"))

// 2) scan api history syntax candidates
async function tryScan(body, label) {
  try {
    const res = await fetch("https://scanner.tradingview.com/egypt/scan", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" },
      body: JSON.stringify(body),
    })
    const t = await res.text()
    console.log(`\n### ${label} → HTTP ${res.status} :: ${t.slice(0, 400)}`)
  } catch (e) { console.log(`\n### ${label} → ERROR ${e.message}`) }
}

await tryScan({ symbols: { tickers: ["EGX:ABUK"] }, columns: ["name", ["total_revenue_fq"]] }, "scan arr1")
await tryScan({ symbols: { tickers: ["EGX:ABUK"] }, columns: ["name", "total_revenue_fq"], options: { history: 4 } }, "scan options.history")
await tryScan({ symbols: { tickers: ["EGX:ABUK"] }, columns: ["name", "total_revenue_fq"], range: [0, 1], history: 4 }, "scan top-level history")

// 3) guess: tradingview financials endpoint on scanner host (path patterns)
const paths = [
  "/api/v1/financials/EGX:ABUK/income/quarterly",
  "/api/v1/financial-statements?symbol=EGX:ABUK&period=quarterly&statement=income-statement",
  "/financials?symbol=EGX:ABUK&period=quarterly",
  "/symbol/financials?symbol=EGX:ABUK",
]
for (const p of paths) {
  const t = await fetchText("https://scanner.tradingview.com" + p, "scanner " + p)
  if (t) console.log(t.slice(0, 200))
}
