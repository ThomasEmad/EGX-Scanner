// Find the real financials endpoint: check the embed widget JS + page bundles
async function fetchText(url, label) {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } })
  const text = await res.text()
  console.log(`### ${label} → HTTP ${res.status} (${text.length} bytes)`)
  return text
}

// 1) embed widget financials
try {
  const w = await fetchText("https://s3.tradingview.com/embed-widget-financials.js", "widget financials.js")
  const urls = [...new Set([...w.matchAll(/https:\/\/[a-z0-9.-]+\/[a-z0-9/_?=&.{}-]*/gi)].map(m => m[0]))]
  console.log("URLs in widget:", urls.slice(0, 30).join("\n"))
  const apiHints = [...new Set([...w.matchAll(/["'](\/[^"']*(financial|statement)[^"']*)["']/gi)].map(m => m[1]))]
  console.log("API paths in widget:", apiHints.slice(0, 20).join("\n"))
} catch (e) { console.log("widget err", e.message) }

// 2) the symbol page: find the financials data API host
const page = await fetchText("https://www.tradingview.com/symbols/EGX-ABUK/financials-overview/", "financials page")
const apiPaths = [...new Set([...page.matchAll(/["'](\/api[^"']{3,120}|https:\/\/[a-z0-9.-]+tradingview[^"']{3,120})["']/gi)].map(m => m[1]))]
console.log("API candidates on financials page:\n" + apiPaths.slice(0, 40).join("\n"))
// any fetch domains
const domains = [...new Set([...page.matchAll(/https:\/\/([a-z0-9.-]+\.tradingview\.com|scanner\.[a-z0-9.-]+)/gi)].map(m => m[1]))]
console.log("Domains:", domains.join("\n"))
