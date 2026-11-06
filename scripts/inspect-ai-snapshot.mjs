// Build the AI snapshot bundle for a ticker WITHOUT calling the LLM —
// verifies the grounded-analysis inputs are clean and the dataHash moved.
import { createJiti } from "jiti"
import path from "node:path"
import { PrismaClient } from "@prisma/client"

const root = path.resolve(process.cwd())
const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false, alias: { "@": path.join(root, "src") } })
const { buildAiSnapshotBundle } = await jiti.import(path.join(root, "src", "lib", "ai", "analysis-snapshot.ts"))
const db = new PrismaClient()

const ticker = (process.argv[2] ?? "ABUK").toUpperCase()
const company = await db.company.findFirst({ where: { ticker }, select: { id: true, ticker: true, nameEn: true, nameAr: true, sector: true, industry: true, sharesOutstanding: true, listingStatus: true } })
if (!company) { console.log("no company"); process.exit(1) }

const bundle = await buildAiSnapshotBundle(company)
const snap = bundle.snapshot ?? bundle
console.log("dataHash:", (bundle.dataHash ?? snap.dataHash ?? "?").slice(0, 16), "…")
const periods = snap.periods ?? bundle.periods ?? []
console.log("periods in snapshot:", periods.length)
for (const p of periods.slice(-6)) {
  const raw = p.rawValues ?? {}
  console.log(`  ${p.periodLabel}: raw NP=${raw.NET_PROFIT ?? "—"} GP=${raw.GROSS_PROFIT ?? "—"} CFO=${raw.OPERATING_CASH_FLOW ?? "—"} TA=${raw.TOTAL_ASSETS ?? "—"}`)
  const cm = p.calculatedMetrics ?? {}
  const interesting = ["net_margin_pct", "roe_pct", "debt_to_equity", "cfo_to_net_profit"]
  console.log(`     calc: ${interesting.map(k => `${k}=${cm[k]}`).join(" ")}`)
}
// any absurd values leaking into raw?
const absurd = []
for (const p of periods) {
  for (const [k, v] of Object.entries(p.rawValues ?? {})) {
    if (typeof v === "number" && Math.abs(v) > 1e12) absurd.push(`${p.periodLabel}:${k}=${v}`)
  }
}
console.log("absurd raw values (>1T):", absurd.length ? absurd : "none")
await db.$disconnect()
