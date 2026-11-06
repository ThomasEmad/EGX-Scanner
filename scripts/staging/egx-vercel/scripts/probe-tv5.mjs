// Extract the embedded financials JSON from the SSR page
const page = await (await fetch("https://www.tradingview.com/symbols/EGX-ABUK/financials-overview/", { headers: { "user-agent": "Mozilla/5.0" } })).text()

// find the JSON blob containing totalRevenue
const i = page.indexOf("totalRevenue")
console.log("context around totalRevenue:\n", page.slice(i - 1500, i + 3000).replace(/\\u002F/g, "/"))
