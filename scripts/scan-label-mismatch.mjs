// scan: how many QUARTERLY reports have a label whose quarter ≠ quarter of periodEnd?
import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const reports = await db.financialReport.findMany({
  where: { periodType: { in: ["QUARTERLY", "SEMIANNUAL"] }, deletedAt: null },
  select: { id: true, companyId: true, periodLabel: true, periodType: true, periodEnd: true, sourceName: true },
})
let bad = 0, ok = 0
const bySource = {}
const byTicker = new Map()
const companies = await db.company.findMany({ select: { id: true, ticker: true } })
const tickerOf = new Map(companies.map((c) => [c.id, c.ticker]))
for (const r of reports) {
  const end = new Date(r.periodEnd)
  const q = Math.floor(end.getUTCMonth() / 3) + 1
  const y = end.getUTCFullYear()
  const m = r.periodLabel.match(/^Q([1-4])\s+(\d{4})$/)
  let okFlag
  if (!m) okFlag = true // other label styles not checked
  else okFlag = Number(m[1]) === q && Number(m[2]) === y
  if (r.periodType === "SEMIANNUAL") {
    const hm = r.periodLabel.match(/^H([12])\s+(\d{4})$/)
    okFlag = hm ? (Number(hm[1]) === (q <= 2 ? 1 : 2) && Number(hm[2]) === y) : true
  }
  if (okFlag) ok++
  else {
    bad++
    const src = r.sourceName.split(/[,+(]/)[0].trim()
    bySource[src] = (bySource[src] || 0) + 1
    const t = tickerOf.get(r.companyId)
    if (!byTicker.has(t)) byTicker.set(t, [])
    byTicker.get(t).push(`${r.periodLabel}→end ${r.periodEnd.toISOString().slice(0, 10)}`)
  }
}
console.log(`QUARTERLY/SEMIANNUAL reports: ok=${ok} MISMATCHED=${bad}`)
console.log("by source:", JSON.stringify(bySource, null, 1))
const top = [...byTicker.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 12)
console.log("top tickers:", top.map(([t, v]) => `${t}(${v.length})`).join(" "))
console.log("sample ABUK:", JSON.stringify(byTicker.get("ABUK")?.slice(0, 8)))
await db.$disconnect()
