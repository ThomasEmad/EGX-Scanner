// Self-test for askborsa-sync.mjs parsing functions against saved HTML files.
import { readFileSync } from "node:fs"

function unescapeNextFlight(html) {
  return html.replace(/\\"/g, '"').replace(/\\\\/g, "\\")
}
const ITEM_TO_METRIC = {
  net_profit: "NET_PROFIT", total_assets: "TOTAL_ASSETS", total_liabilities: "TOTAL_LIABILITIES",
  total_equity: "TOTAL_EQUITY", total_liabilities_and_equity: "TOTAL_EQUITY_AND_LIABILITIES",
  cf_operating: "OPERATING_CASH_FLOW", cf_investing: "INVESTING_CASH_FLOW",
  cf_financing: "FINANCING_CASH_FLOW", net_change_in_cash: "NET_CHANGE_IN_CASH", dividends_paid: "DIVIDENDS_PAID",
}
function periodHrefPeriods(html, ticker) {
  const escapedTicker = ticker.replace(/[.*+?^${}()|[\]\\]/g, "\\$")
  const re = new RegExp(`href="/company/${escapedTicker}/(fy|q[1-4])-(\\d{4})"`, "g")
  const out = new Set()
  let m
  while ((m = re.exec(html))) out.add(`${m[1]}-${m[2]}`)
  return [...out]
}
function parseStatementPage(html, ticker) {
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)].map((m) => m[1])
  if (!chunks.length) return { metrics: {}, otherPeriods: [], parsed: false }
  const flight = unescapeNextFlight(chunks.join(""))
  const marks = []
  const markRe = /\["\$","div","([a-z_0-9]+)",\{"className":"(?:card|grid)/g
  let mm
  while ((mm = markRe.exec(flight))) marks.push({ id: mm[1], start: mm.index })
  const metrics = {}
  for (let i = 0; i < marks.length; i++) {
    const segEnd = i + 1 < marks.length ? marks[i + 1].start : Math.min(marks[i].start + 4000, flight.length)
    const seg = flight.slice(marks[i].start, segEnd)
    const metric = ITEM_TO_METRIC[marks[i].id]
    if (!metric) continue
    const titles = [...seg.matchAll(/"title":"([0-9][0-9,.-]*)"/g)].map((m) => Number(m[1].replace(/,/g, "")))
    const isHero = /className":"card/.test(seg.slice(0, 80))
    const entry = metrics[metric] ?? {}
    if (titles[0] !== undefined && Number.isFinite(titles[0])) entry.current = titles[0]
    if (!isHero && titles[1] !== undefined && Number.isFinite(titles[1])) entry.prior = titles[1]
    metrics[metric] = entry
  }
  return { metrics, otherPeriods: periodHrefPeriods(html, ticker), parsed: true }
}

let failures = 0
function expect(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); failures++ }
}

// GPIM q3-2026: newest partial page (net profit only)
const gpim = parseStatementPage(readFileSync("/tmp/askborsa_gpim_q326.html", "utf8"), "GPIM")
expect(gpim.metrics.NET_PROFIT?.current === 3384316, `GPIM NP current = ${gpim.metrics.NET_PROFIT?.current} (want 3384316)`)
expect(gpim.metrics.NET_PROFIT?.prior === 6673987, `GPIM NP prior = ${gpim.metrics.NET_PROFIT?.prior} (want 6673987)`)
expect(gpim.otherPeriods.includes("q3-2025"), "GPIM otherPeriods has q3-2025")

// COMI q3-2024: full page (10 rows + comparatives)
const comi = parseStatementPage(readFileSync("/tmp/askborsa_comi_q3.html", "utf8"), "COMI")
expect(comi.metrics.NET_PROFIT?.current === 26725407000, `COMI NP current = ${comi.metrics.NET_PROFIT?.current}`)
expect(comi.metrics.NET_PROFIT?.prior === 8353174000, `COMI NP prior = ${comi.metrics.NET_PROFIT?.prior}`)
expect(comi.metrics.TOTAL_ASSETS?.current === 1119958017000, `COMI TA current = ${comi.metrics.TOTAL_ASSETS?.current}`)
expect(comi.metrics.TOTAL_LIABILITIES?.current === 981551721000, `COMI TL current = ${comi.metrics.TOTAL_LIABILITIES?.current}`)
expect(comi.metrics.TOTAL_EQUITY?.current === 138000000000 || comi.metrics.TOTAL_EQUITY?.current > 1e11, `COMI TE current = ${comi.metrics.TOTAL_EQUITY?.current}`)
expect(Object.keys(comi.metrics).length >= 8, `COMI metrics count = ${Object.keys(comi.metrics).length}`)
expect(comi.otherPeriods.includes("q3-2025"), "COMI otherPeriods has q3-2025")

console.log(failures === 0 ? "ALL PARSER TESTS PASSED" : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
