import { readFileSync } from "node:fs"
const text = readFileSync("reports/askborsa-annual-comparison.csv", "utf8").replace(/^\uFEFF/, "")
const lines = text.split(/\r?\n/).filter(Boolean)
const header = lines[0].split(",")
const idx = Object.fromEntries(header.map((h,i)=>[h,i]))
const rows = lines.slice(1).map(l => l.split(",")).filter(r => ["MISMATCH","SCALE_X1000","SCALE_DIV1000","ASK_SCALE_SUSPECT","PARENT_MATCH"].includes(r[idx.status]))
const by = new Map()
for (const r of rows) { const t=r[idx.ticker]; if(!by.has(t)) by.set(t,[]); by.get(t).push(r) }
for (const [t, rs] of [...by.entries()].sort()) {
  console.log(`\n${t}`)
  for (const r of rs) console.log(`  ${r[idx.metric]} ask${r[idx.askYear]}=${r[idx.askValue]} app=${r[idx.appValue]} parent=${r[idx.appParentNetProfit]||""} ratio=${r[idx.ratio]} ${r[idx.status]} ${r[idx.detail]||""}`)
}
