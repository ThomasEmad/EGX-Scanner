// debug: classify ABUK quarterly columns and show cells per column
import { readFileSync } from "node:fs"
const snap = JSON.parse(readFileSync("reports/tv-financials-snapshot.json", "utf8"))
const view = snap.companies.ABUK.statements["income-statement"].quarterly
console.log("headers n=", view.headers.length, "subs n=", (view.subheaders ?? []).length)
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
function parseMonthYear(s) {
  const m = String(s || "").trim().match(/^([A-Za-z]{3})\s+(\d{4})$/)
  if (!m) return null
  const mi = MONTHS[m[1].toLowerCase()]
  if (mi === undefined) return null
  return new Date(Date.UTC(Number(m[2]), mi + 1, 0, 23, 59, 59))
}
for (let i = 0; i < view.headers.length; i++) {
  const h = view.headers[i]
  const s = view.subheaders?.[i]
  console.log(String(i).padStart(2), h.padEnd(9), "→", s, "→", parseMonthYear(s)?.toISOString().slice(0, 10))
}
// row values for total_revenue around 2026
const row = view.rows.find((r) => r.id === "total_revenue")
console.log("\ntotal_revenue last 8:", row.values.slice(-8))
