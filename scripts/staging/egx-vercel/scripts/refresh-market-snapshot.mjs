// Refresh the standalone market snapshot from the public TradingView EGX
// scanner (15-minute delayed). This is the file the running app reads; it is
// copied into `.next/standalone/public/data` when that build exists.
//
// Usage: node scripts/refresh-market-snapshot.mjs

import fs from "node:fs"
import path from "node:path"

const SCANNER = "https://scanner.tradingview.com/egypt/scan"
const INDICES = [
  { symbol: "EGX:EGX30", name: "EGX30" },
  { symbol: "EGX:EGX70EWI", name: "EGX70 EWI" },
  { symbol: "EGX:EGX100EWI", name: "EGX100 EWI" },
  { symbol: "EGX:EGX30CAPPED", name: "EGX30CAPPED" },
]

async function scan(body) {
  const res = await fetch(SCANNER, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`scanner HTTP ${res.status}`)
  return res.json()
}

const stocks = await scan({
  filter: [{ left: "exchange", operation: "equal", right: "EGX" }],
  options: { lang: "en" },
  markets: ["egypt"],
  symbols: { query: { types: [] }, tickers: [] },
  columns: ["name", "description", "close", "change", "volume", "update_mode"],
  sort: { sortBy: "name", sortOrder: "asc" },
  range: [0, 1000],
})

const indexRows = await scan({
  symbols: { tickers: INDICES.map((i) => i.symbol), query: { types: [] } },
  columns: ["name", "description", "close", "change", "update_mode"],
})

const indexBySymbol = new Map((indexRows.data ?? []).map((r) => [r.s, r.d]))
const indices = INDICES.map((i) => {
  const d = indexBySymbol.get(i.symbol)
  return d ? { name: i.name, level: d[2], changePct: d[3] } : null
}).filter(Boolean)

const movers = (stocks.data ?? [])
  .map((r) => {
    const d = r.d
    return { ticker: d[0], price: d[2], changePct: d[3], volume: d[4], updateMode: d[5] }
  })
  .filter(
    (m) =>
      Number.isFinite(m.price) &&
      m.price > 0 &&
      Number.isFinite(m.changePct) &&
      Math.abs(m.changePct) <= 50,
  )

const fetchedAt = new Date().toISOString()
const snapshot = {
  asOf: fetchedAt,
  indicesAsOf: fetchedAt,
  pricesAsOf: fetchedAt,
  delayMinutes: 15,
  sourceNote: "Public exchange scanner, 15-minute delayed",
  indices,
  movers,
}

const targets = [
  path.join(process.cwd(), "public", "data", "market-ticker.json"),
  path.join(process.cwd(), ".next", "standalone", "public", "data", "market-ticker.json"),
]
for (const file of targets) {
  if (file.includes(`${path.sep}.next${path.sep}`) && !fs.existsSync(path.dirname(file))) continue
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2))
  console.log(`wrote ${file}`)
}

console.log(
  JSON.stringify(
    {
      indices: indices.length,
      movers: movers.length,
      gainers: movers.filter((m) => m.changePct > 0).length,
      losers: movers.filter((m) => m.changePct < 0).length,
      asOf: fetchedAt,
    },
    null,
    1,
  ),
)
