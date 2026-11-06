// debug: run matrixFromView on the ABUK snapshot
import { readFileSync } from "node:fs"
const snap = JSON.parse(readFileSync("reports/tv-financials-snapshot.json", "utf8"))
const rec = snap.companies.ABUK
console.log("currency:", rec.currency, "frequency:", rec.frequency, "tvSymbol:", rec.tvSymbol)
console.log("statements:", Object.keys(rec.statements))
for (const [st, v] of Object.entries(rec.statements)) {
  console.log(`\n=== ${st} ===`)
  for (const vn of ["annual", "quarterly"]) {
    const view = v[vn]
    if (!view) { console.log(vn, "null"); continue }
    if (view.error) { console.log(vn, "ERROR:", view.error); continue }
    console.log(vn, "headers:", (view.headers ?? []).length, "subheaders:", (view.subheaders ?? []).length, "rows:", (view.rows ?? []).length)
    console.log("  header sample:", (view.headers ?? []).slice(0, 3), "…", (view.headers ?? []).slice(-3))
    console.log("  sub sample:", (view.subheaders ?? []).slice(0, 3), "…", (view.subheaders ?? []).slice(-3))
    if (view.rows?.length) console.log("  row0:", view.rows[0].id, "vals:", view.rows[0].values.length, JSON.stringify(view.rows[0].values.slice(0, 3)))
  }
}
