// Extract the full statement table from TradingView's statement pages
const page = await (await fetch("https://www.tradingview.com/symbols/EGX-ABUK/financials-income-statement/", { headers: { "user-agent": "Mozilla/5.0" } })).text()

// all init-data JSON blobs
const blobs = [...page.matchAll(/<script type="application\/prs\.init-data\+json">([\s\S]*?)<\/script>/g)]
console.log(`init-data blobs: ${blobs.length}, sizes: ${blobs.map(b => b[1].length).join(",")}`)

for (const b of blobs) {
  const t = b[1]
  if (t.includes("totalRevenue") || t.includes("total_revenue") || t.includes("quarterly") || t.includes("fiscal")) {
    console.log("\n=== candidate blob (first 3000 chars) ===")
    console.log(t.slice(0, 3000))
    break
  }
}
