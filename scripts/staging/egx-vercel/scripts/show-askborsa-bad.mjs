import { readFileSync } from "node:fs"
const text = readFileSync("reports/askborsa-annual-comparison.csv", "utf8").replace(/^\uFEFF/, "")
const lines = text.split(/\r?\n/).filter(Boolean)
const header = lines.shift().split(",")
const rows = lines.map(l => {
  const cells = []
  let cur = "", q = false
  for (let i=0;i<l.length;i++) {
    const ch=l[i]
    if (ch === '"') { if (q && l[i+1] === '"') { cur+='"'; i++ } else q=!q }
    else if (ch === "," && !q) { cells.push(cur); cur="" }
    else cur+=ch
  }
  cells.push(cur)
  return Object.fromEntries(header.map((h,i)=>[h,cells[i]??""]))
})
const bad = rows.filter(r => !["MATCH","CLOSE"].includes(r.status))
for (const r of bad) {
  if (r.metric === "NAME") continue
  console.log([r.ticker, r.metric, r.status, r.askYear, r.askValue, r.appValue, r.ratio].join(" | "))
}
