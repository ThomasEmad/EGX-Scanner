// Inventory what an askborsa statement page carries:
// the metric-block div ids (card/grid) and their current/prior title values.
import { readFileSync } from "node:fs"

const file = process.argv[2] ?? "/tmp/abuk-q2-2026.html"
const html = readFileSync(file, "utf8")

function unescapeNextFlight(h) { return h.replace(/\\"/g, '"').replace(/\\\\/g, "\\") }

const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)].map((m) => m[1])
if (!chunks.length) { console.log("no flight chunks"); process.exit(0) }
const flight = unescapeNextFlight(chunks.join(""))

const marks = []
const markRe = /\["\$","div","([a-z_0-9]+)",\{"className":"(?:card|grid)/g
let mm
while ((mm = markRe.exec(flight))) marks.push({ id: mm[1], start: mm.index })
console.log(`marks: ${marks.map(m => m.id).join(", ")}`)

const ITEM_TO_METRIC = {
  net_profit: "NET_PROFIT", gross_profit: "GROSS_PROFIT", revenue: "REVENUE", cogs: "COGS",
  total_assets: "TOTAL_ASSETS", total_liabilities: "TOTAL_LIABILITIES", total_equity: "TOTAL_EQUITY",
  total_liabilities_and_equity: "TOTAL_EQUITY_AND_LIABILITIES",
  cf_operating: "OPERATING_CASH_FLOW", cf_investing: "INVESTING_CASH_FLOW",
  cf_financing: "FINANCING_CASH_FLOW", net_change_in_cash: "NET_CHANGE_IN_CASH",
  dividends_paid: "DIVIDENDS_PAID",
}

for (let i = 0; i < marks.length; i++) {
  const segEnd = i + 1 < marks.length ? marks[i + 1].start : Math.min(marks[i].start + 4000, flight.length)
  const seg = flight.slice(marks[i].start, segEnd)
  const metric = ITEM_TO_METRIC[marks[i].id] ?? "(unmapped)"
  const isHero = /className":"card/.test(seg.slice(0, 80))
  const titles = [...seg.matchAll(/"title":"([0-9][0-9,.-]*)"/g)].map((m) => Number(m[1].replace(/,/g, "")))
  // also grab the visible label text near the id
  const label = /"children":\["([^"]{2,60})"/.exec(seg)?.[1] ?? ""
  console.log(`${marks[i].id.padEnd(32)} → ${metric.padEnd(28)} ${isHero ? "HERO " : "     "} current=${titles[0]} prior=${titles[1]} label="${label}"`)
}

// page title
const title = /<title>([^<]+)<\/title>/.exec(html)?.[1]
console.log("\ntitle:", title)
// period links discovered
const re = /href="\/company\/([A-Z]+)\/(fy|q[1-4])-(\d{4})"/g
const links = new Set()
let m
while ((m = re.exec(html))) links.add(`${m[1]}:${m[2]}-${m[3]}`)
console.log("links:", [...links].sort().join(" "))
