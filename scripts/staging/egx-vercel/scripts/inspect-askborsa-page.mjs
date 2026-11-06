// Inspect what an askborsa overview page currently contains for a ticker:
// pivot periods+items, period links, currency, fiscal year start, latest period label.
import { readFileSync } from "node:fs"

const file = process.argv[2] ?? "/tmp/abuk-overview.html"
const ticker = (process.argv[3] ?? "ABUK").toUpperCase()
const html = readFileSync(file, "utf8")

function unescapeNextFlight(html) { return html.replace(/\\"/g, '"').replace(/\\\\/g, "\\") }

function extractPivots(html) {
  const text = unescapeNextFlight(html)
  const start = text.indexOf('[{"period":"')
  if (start < 0) return null
  let depth = 0, inString = false, escaped = false, end = -1
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
    } else {
      if (ch === '"') inString = true
      else if (ch === "[") depth++
      else if (ch === "]") { depth--; if (depth === 0) { end = i + 1; break } }
    }
  }
  if (end < 0) return null
  try { return JSON.parse(text.slice(start, end)) } catch (e) { console.log("pivot parse fail:", String(e).slice(0, 100)); return null }
}

const pivots = extractPivots(html)
if (pivots) {
  for (const p of pivots) {
    console.log(`pivot ${p.period}: years=[${(p.years ?? []).join(",")}] items=${(p.rows ?? []).map(r => r.item).join(",")}`)
    for (const row of p.rows ?? []) {
      const vals = row.values ?? {}
      const keys = Object.keys(vals)
      console.log(`   ${row.item}: ${keys.map(k => `${k}=${vals[k]}`).join(" ")}`)
    }
  }
} else console.log("no pivot found")

// period links
const re = new RegExp(`href="/company/${ticker}/(fy|q[1-4])-(\\d{4})"`, "g")
const links = new Set()
let m
while ((m = re.exec(html))) links.add(`${m[1]}-${m[2]}`)
console.log(`\nperiod links (${links.size}):`, [...links].sort().join(" "))

// metadata text
const text = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ")
  .replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ")
const currency = /العملة\s+(EGP|USD)/.exec(text)?.[1]
const fiscalMonthAr = /السنة المالية تبدأ في\s+([^\s·،]+)/.exec(text)?.[1] ?? null
const latest = /آخر قوائم:\s*([^·]+?)(?:\s+النتائج القادمة|$)/.exec(text)?.[1]?.trim()
const upcoming = /النتائج القادمة\s*([^·]{0,80})/.exec(text)?.[1]?.trim()
console.log(`\ncurrency=${currency} fiscalStart=${fiscalMonthAr}`)
console.log(`latestPeriod=${latest}`)
console.log(`upcoming=${upcoming}`)
