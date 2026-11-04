import { readFileSync } from "node:fs"
const text = readFileSync("reports/askborsa-annual-comparison.csv", "utf8").replace(/^\uFEFF/, "")
const lines = text.split(/\r?\n/).filter(Boolean)
const header = lines[0].split(",")
const idx = Object.fromEntries(header.map((h,i)=>[h,i]))
console.log("header", header.join(" | "))
const rows = lines.slice(1).map(l => l.split(",")).filter(r => ["MISMATCH","SCALE_X1000","SCALE_DIV1000"].includes(r[idx.status]))
const byTicker = new Map()
for (const r of rows) {
  const t = r[idx.ticker]
  if (!byTicker.has(t)) byTicker.set(t, [])
  byTicker.get(t).push(r)
}
for (const [t, rs] of [...byTicker.entries()].sort()) {
  console.log(`\n${t} (${rs.length})`)
  for (const r of rs) console.log(`  ${r[idx.metric]} ask${r[idx.askYear]}=${r[idx.askValue]} app=${r[idx.appValue]} ratio=${r[idx.ratio]} ${r[idx.askCurrency]||""}/${r[idx.appCurrency]||""} ${r[idx.status]} | ${(r[idx.detail]||"").slice(0,100)}`)
}
