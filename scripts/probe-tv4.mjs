// Dig into the financials-overview page: find embedded data or the XHR pattern
const page = await (await fetch("https://www.tradingview.com/symbols/EGX-ABUK/financials-overview/", { headers: { "user-agent": "Mozilla/5.0" } })).text()

// 1) does the page embed financial data already?
for (const kw of ["totalRevenue", "total_revenue", "Gross Profit", "grossProfit", "fiscalPeriod", "quarterly", "incomeStatement", "income-statement", "financials", "35.4", "13.99"]) {
  const i = page.indexOf(kw)
  console.log(kw.padEnd(18), i >= 0 ? `FOUND @${i}` : "not found")
}

// 2) find JS bundle URLs (not css)
const jsBundles = [...new Set([...page.matchAll(/https:\/\/static\.tradingview\.com\/static\/bundles\/[0-9]+\.[a-z0-9]+\.js/g)].map(m => m[0]))]
console.log("\nJS bundles:", jsBundles.length)

// 3) search page for scanner-backend usage
const sb = page.indexOf("scanner-backend")
if (sb >= 0) console.log("\nscanner-backend context:", page.slice(sb - 200, sb + 300).replace(/\s+/g, " "))

// 4) "financial" API path hints in HTML
const hints = [...new Set([...page.matchAll(/["']([a-z0-9/_-]*(?:financial|statement)[a-z0-9/_-]*)["']/gi)].map(m => m[1]))]
console.log("\nPath hints:", hints.slice(0, 30).join(" | "))
