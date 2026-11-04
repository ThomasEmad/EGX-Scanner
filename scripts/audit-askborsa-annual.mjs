// Cross-check every app company's latest annual figures against AskBorsa.
//
//   node scripts/audit-askborsa-annual.mjs
//
// AskBorsa publishes a compact annual summary on each company page:
//   صافي الربح · 2025 161 مليون …
//   إجمالي الأصول · 2025 …
//   حقوق المساهمين · 2025 …
// The script parses those figures, compares them with the app's stored annual
// CalculatedMetric rows for the SAME fiscal year, and writes:
//   reports/askborsa-annual-comparison.csv
//   reports/askborsa-annual-summary.json
//
// It is read-only: it never changes a value. Its purpose is to produce an
// evidence-based remediation queue (scale errors, wrong company identity,
// stale/missing years) instead of guessing.
import { mkdirSync, writeFileSync } from "node:fs"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const CONCURRENCY = 4
const METRICS = ["net_profit", "total_assets", "total_equity", "revenue"]

// AskBorsa cases already disproved by a stronger source. They are kept out of
// the mismatch queue so a future run does not "fix" a correct app value.
const KNOWN_SOURCE_ERRORS = {
  "HDBK|net_profit|2024": "AskBorsa 27.99m is a parsing error; app 12.43bn FY2024 / 18.68bn FY2025 verified from bank filings",
  "ARCC|net_profit|2024": "AskBorsa 495m is standalone; app 1.16bn consolidated verified from Mubasher/company audited results",
  "CANA|net_profit|2025": "AskBorsa 1.37bn is Q4 standalone; official FY2025 net profit 6.421bn (bank release/Reuters)",
  "BQDC|net_profit|2020": "AskBorsa FY2020 is printed in thousands; app 3.235bn is correct",
  "BQDC|total_assets|2020": "AskBorsa FY2020 is printed in thousands; app 205.4bn is correct",
  "BQDC|total_equity|2020": "AskBorsa FY2020 is printed in thousands; app 17.63bn is correct",
  "IRON|net_profit|2020": "AskBorsa FY2020 is printed in thousands; app -983m is correct",
  "IRON|total_assets|2020": "AskBorsa FY2020 is printed in thousands; app 2.83bn is correct",
  "IRON|total_equity|2020": "AskBorsa FY2020 is printed in thousands; app -5.77bn is correct",
}

/** Per-company statement preference (same rule as statement-pref.ts). */
function preferConsolidatedRows(rows) {
  const hasConsolidated = new Set()
  for (const r of rows) if (r.statementType === "CONSOLIDATED") hasConsolidated.add(r.companyId)
  return rows.filter((r) => r.statementType === "CONSOLIDATED" || !hasConsolidated.has(r.companyId))
}

const LABELS = {
  net_profit: ["صافي الربح"],
  total_assets: ["إجمالي الأصول"],
  total_equity: ["حقوق المساهمين", "حقوق الملكية"],
  revenue: ["الإيرادات", "إجمالي الإيرادات"],
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
}

function parseFigure(text, labels) {
  let best = null
  for (const label of labels) {
    const re = new RegExp(label + String.raw`\s*·\s*(\d{4})\s*([−-]?[\d.,]+)\s*(تريليون|مليار|مليون|ألف)?`, "g")
    let m
    while ((m = re.exec(text))) {
      const year = Number(m[1])
      const raw = m[2].replace(/,/g, "").replace("−", "-")
      const n = Number(raw)
      if (!Number.isFinite(n)) continue
      const unit = m[3]
      // AskBorsa prints COMI's 1.21 trillion as "1.21 تريليون"; without this
      // branch the parser read it as 1.21 and every COMI ratio looked like 1e12.
      const mult = unit === "تريليون" ? 1e12 : unit === "مليار" ? 1e9 : unit === "مليون" ? 1e6 : unit === "ألف" ? 1e3 : 1
      const value = n * mult
      if (!best || year > best.year) best = { year, value, unit: unit ?? "", raw: m[2] }
    }
  }
  return best
}

function parseAskBorsa(html) {
  const text = stripHtml(html)
  const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/\s+/g, " ").trim() ?? ""
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? ""
  // AskBorsa prints "العملة EGP" (or USD for ORAS and a few others). Raw
  // amounts across currencies are not comparable, so keep the currency and
  // let the comparison mark those rows instead of reporting a fake mismatch.
  const currencyRaw = text.match(/العملة\s*(EGP|USD|EUR|SAR|AED|جنيه|دولار)/)?.[1] ?? null
  const currency = currencyRaw === "جنيه" ? "EGP" : currencyRaw === "دولار" ? "USD" : currencyRaw
  const figures = {}
  for (const code of METRICS) figures[code] = parseFigure(text, LABELS[code])
  return { title, h1, figures, currency, textLength: text.length }
}

async function fetchAsk(ticker) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`https://askborsa.com/company/${ticker}`, {
        headers: { "user-agent": "Mozilla/5.0 EGX-Scanner data audit" },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const html = await res.text()
      return parseAskBorsa(html)
    } catch (e) {
      if (attempt === 3) throw e
      await new Promise((r) => setTimeout(r, 500 * attempt))
    }
  }
}

function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\b(the|co|company|sae|s a e|eg|egypt|egyptian|for|and|of)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function namesLikelyMatch(appAr, askTitle) {
  if (!appAr || !askTitle) return true
  const a = norm(appAr)
  const b = norm(askTitle)
  if (!a || !b) return true
  const at = new Set(a.split(" ").filter((x) => x.length > 1))
  const bt = new Set(b.split(" ").filter((x) => x.length > 1))
  let shared = 0
  for (const t of at) if (bt.has(t)) shared++
  return shared > 0
}

function statusFor(ask, app) {
  if (ask === null || ask === undefined) return "ASK_MISSING"
  if (app === null || app === undefined) return "APP_MISSING"
  if (ask === 0) return Math.abs(app) < 1e-9 ? "MATCH" : "ASK_ZERO"
  const ratio = app / ask
  if (ratio >= 0.95 && ratio <= 1.05) return "MATCH"
  if (ratio >= 0.90 && ratio <= 1.10) return "CLOSE"
  if (ratio >= 900 && ratio <= 1100) return "SCALE_X1000"
  if (ratio >= 0.0009 && ratio <= 0.0011) return "SCALE_DIV1000"
  if (ratio >= 9e5 && ratio <= 1.1e6) return "SCALE_X1E6"
  if (ratio >= 9e-7 && ratio <= 1.1e-6) return "SCALE_DIV1E6"
  return "MISMATCH"
}

// A 1000x difference is only an app error if the app value is also a 1000x
// outlier against its own neighbouring years. BQDC (Banque du Caire) FY2020 is
// the counter-example: app assets 205.4bn sit between 183.3bn (2019) and
// 255.1bn (2021), while AskBorsa prints 205m (thousands). Scaling that app
// value down would corrupt a correct bank statement.
function appScaleContinuous(rows, metric, year, value) {
  if (!Number.isFinite(value) || value === 0) return false
  const neighbours = rows.filter(
    (r) => r.code === metric && r.valueStatus === "OK" && r.value !== null &&
      r.fiscalYear !== year && Math.abs(r.fiscalYear - year) <= 2,
  )
  if (!neighbours.length) return false
  return neighbours.some((r) => {
    const ratio = Math.abs(value / r.value)
    return Number.isFinite(ratio) && ratio >= 0.2 && ratio <= 5
  })
}

async function main() {
  const companies = await db.company.findMany({
    where: { isActive: true },
    select: { id: true, ticker: true, nameEn: true, nameAr: true, sector: true },
    orderBy: { ticker: "asc" },
  })

  const rows = []
  const summary = { companies: companies.length, fetched: 0, failed: 0, nameMismatches: 0, byStatus: {}, byMetric: {} }
  let done = 0

  async function processCompany(c) {
    let ask
    try {
      ask = await fetchAsk(c.ticker)
      summary.fetched++
    } catch (e) {
      summary.failed++
      rows.push({ ticker: c.ticker, nameEn: c.nameEn, sector: c.sector, metric: "FETCH", status: "FETCH_FAILED", detail: String(e).slice(0, 160) })
      return
    }

    if (!namesLikelyMatch(c.nameAr, ask.title)) {
      summary.nameMismatches++
      rows.push({
        ticker: c.ticker, nameEn: c.nameEn, nameAr: c.nameAr, sector: c.sector,
        metric: "NAME", status: "NAME_MISMATCH", askName: ask.title, appName: c.nameAr,
      })
    }

    const cms = await db.calculatedMetric.findMany({
      where: { companyId: c.id, code: { in: METRICS }, periodType: "ANNUAL" },
      select: { companyId: true, code: true, value: true, valueStatus: true, fiscalYear: true, periodLabel: true, statementType: true },
    })
    const preferred = preferConsolidatedRows(cms)

    // AskBorsa's "net profit" is often the parent (attributable) figure while
    // the app's calculated net_profit is the consolidated total. Pull the raw
    // NET_PROFIT_PARENT rows so a parent/total difference is not reported as a
    // data error.
    const parentReports = await db.financialReport.findMany({
      where: { companyId: c.id, periodType: "ANNUAL" },
      select: { fiscalYear: true, values: { where: { metricCode: "NET_PROFIT_PARENT", validationStatus: "VALID" }, take: 1, select: { normalizedValue: true } } },
    })
    const parentByYear = new Map()
    for (const r of parentReports) {
      if (r.values[0]?.normalizedValue != null) parentByYear.set(r.fiscalYear, r.values[0].normalizedValue)
    }

    // Currency of the app's own latest annual report (the calculated rows do
    // not carry a currency). Used only to flag cross-currency comparisons.
    const latestAnnual = await db.financialReport.findFirst({
      where: { companyId: c.id, periodType: "ANNUAL" },
      orderBy: { fiscalYear: "desc" },
      select: { values: { where: { metricCode: "NET_PROFIT" }, take: 1, select: { currency: true } } },
    })
    const appCurrency = latestAnnual?.values[0]?.currency ?? null

    for (const metric of METRICS) {
      const f = ask.figures[metric]
      if (!f) {
        rows.push({ ticker: c.ticker, nameEn: c.nameEn, sector: c.sector, metric, status: "ASK_MISSING", askYear: null, askValue: null, appValue: null })
        continue
      }
      const candidates = preferred.filter((r) => r.code === metric && r.fiscalYear === f.year && r.valueStatus === "OK" && r.value !== null)
      const app = candidates.length ? candidates[candidates.length - 1].value : null
      let status = statusFor(f.value, app)
      let detail = ""
      // A raw USD figure compared with an EGP figure is not a data mismatch.
      if (app !== null && ask.currency && appCurrency && ask.currency !== appCurrency) {
        status = "CURRENCY_MISMATCH"
      }
      const parent = metric === "net_profit" ? (parentByYear.get(f.year) ?? null) : null
      if (parent !== null && f.value !== 0 && Math.abs(parent / f.value - 1) <= 0.05 && status !== "MATCH") {
        status = "PARENT_MATCH"
        detail = "AskBorsa net profit matches app NET_PROFIT_PARENT; app total includes NCI"
      }
      if ((status === "SCALE_X1000" || status === "SCALE_DIV1000") && app !== null && appScaleContinuous(preferred, metric, f.year, app)) {
        status = "ASK_SCALE_SUSPECT"
        detail = "App value is continuous with adjacent years; AskBorsa appears x1000 off (do not auto-scale)"
      }
      const known = KNOWN_SOURCE_ERRORS[`${c.ticker}|${metric}|${f.year}`]
      if (known) {
        status = "KNOWN_SOURCE_ERROR"
        detail = known
      }
      const ratio = app !== null && f.value !== 0 ? app / f.value : null
      rows.push({
        ticker: c.ticker, nameEn: c.nameEn, sector: c.sector, metric,
        askYear: f.year, askValue: f.value, appValue: app,
        ratio: ratio === null ? null : Number(ratio.toFixed(6)),
        status,
        askCurrency: ask.currency,
        appCurrency,
        askName: ask.title,
        appParentNetProfit: parent,
        detail,
      })
      summary.byStatus[status] = (summary.byStatus[status] ?? 0) + 1
      summary.byMetric[metric] ??= {}
      summary.byMetric[metric][status] = (summary.byMetric[metric][status] ?? 0) + 1
    }
  }

  const queue = [...companies]
  async function worker() {
    while (queue.length) {
      const c = queue.shift()
      if (!c) break
      await processCompany(c)
      done++
      if (done % 25 === 0) console.log(`progress ${done}/${companies.length}`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  mkdirSync("reports", { recursive: true })
  const header = ["ticker", "nameEn", "nameAr", "sector", "metric", "status", "askYear", "askValue", "appValue", "appParentNetProfit", "ratio", "askCurrency", "appCurrency", "askName", "appName", "detail"]
  const csv = [
    header.join(","),
    ...rows.map((r) => header.map((h) => {
      const v = r[h]
      if (v === null || v === undefined) return ""
      const s = String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }).join(",")),
  ].join("\n")
  writeFileSync("reports/askborsa-annual-comparison.csv", "\uFEFF" + csv, "utf8")
  writeFileSync("reports/askborsa-annual-summary.json", JSON.stringify(summary, null, 2), "utf8")

  console.log("\n=== AskBorsa annual comparison ===")
  console.log(JSON.stringify(summary, null, 2))
  console.log("Wrote reports/askborsa-annual-comparison.csv")
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
