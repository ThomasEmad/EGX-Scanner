// AskBorsa → DB full sync pipeline (one file).
//
//   node scripts/askborsa-sync.mjs                      # harvest + build plan (DRY RUN)
//   node scripts/askborsa-sync.mjs --from-snapshot      # plan from saved snapshot, no network
//   node scripts/askborsa-sync.mjs --apply              # write to DB (+ rollback file + audit log)
//   node scripts/askborsa-sync.mjs --apply --recompute  # write + rebuild derived metrics
//   node scripts/askborsa-sync.mjs --rollback           # undo the last --apply
//   node scripts/askborsa-sync.mjs --tickers=COMI,ETEL  # restrict to tickers (smoke test)
//   node scripts/askborsa-sync.mjs --limit=10           # first N tickers
//
// What it reads (public pages only — no auth/paywall bypass, robots.txt allows
// public page crawling):
//   1. /company/{TICKER}            → embedded 5-year pivot JSON (FY + Q1..Q4 × 10 items)
//                                     + metadata (currency, fiscal-year start) + period links
//   2. /company/{TICKER}/{fy|qN}-{y} → per-period statement pages. Newer periods
//                                     (e.g. q3-2026) often exist ONLY here; the page
//                                     payload carries precise values (title attrs) for
//                                     the period AND its prior-year comparative.
//
// Import policy (conservative, mirrors the platform's established rules):
//   • only-missing-slot: existing values are NEVER overwritten; conflicts (>5%)
//     are logged to reports/askborsa-sync-conflicts.json for review.
//   • FLOW metrics (profit/cash flows): askborsa bank pages are CUMULATIVE (9M),
//     non-bank pages are usually DISCRETE. Per (company, metric) the script votes
//     a pattern from years where the full series + FY exist:
//       discrete  : Q1+Q2+Q3+Q4 ≈ FY (5%/1m), no Q1..Q3 equals FY  → QUARTERLY reports
//                   (relaxed: askborsa sometimes replaces a missing quarter —
//                    usually Q1 — with the FY value; that slot is treated as
//                    missing and the remaining quarters must fit under FY)
//       cumulative: magnitudes monotone, terminal ≈ FY             → Q1=Q report,
//                                                                     Q2=H1, Q3=9M
//     current-year quarters (no ask FY yet) import when either the historical
//     pattern is known, OR the statement page itself declares its convention via
//     the prior-year comparative (q2-2026 pages carry H1-2025, not Q2-2025):
//       prior ≈ prior-year same quarter           → DISCRETE quarterly
//       prior ≈ FY_prev − later quarters          → CUMULATIVE → SEMIANNUAL/NINE_MONTH
//     and a discrete quarter is then derived exactly (H1 − Q1, 9M − H1).
//   • STOCK metrics (assets/liabilities/equity): point-in-time; quarter must
//     differ from FY, scale-sane (0.1–10×) vs FY/app annual. Q4 stock ≡ FY stock.
//   • Annual years missing entirely are created when ≥3 values exist.
//   • EGP companies only (currency from AskBorsa metadata); future periods skipped.
import { PrismaClient } from "@prisma/client"
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { statementKind } from "./lib/statement-kind.mjs"

const db = new PrismaClient()

const SNAPSHOT = "reports/askborsa-sync-snapshot.json"
const PLAN = "reports/askborsa-sync-plan.json"
const ROLLBACK = "reports/askborsa-sync-rollback.json"
const CONFLICTS = "reports/askborsa-sync-conflicts.json"
const MARK = "ASKBORA_SYNC:"
const PARSER = "askborsa-sync@1"

const APPLY = process.argv.includes("--apply")
const FROM_SNAPSHOT = process.argv.includes("--from-snapshot")
const ROLLBACK_MODE = process.argv.includes("--rollback")
const RECOMPUTE = process.argv.includes("--recompute")
// --recent-only: fetch overviews + statement pages for CURRENT_YEAR periods
// only (classification of current-year pages needs their printed priors; the
// historical periods come from the previous full snapshot via --merge-prev).
// --merge-prev: merge the fresh recent harvest with reports/askborsa-sync-snapshot.prev.json
const RECENT_ONLY = process.argv.includes("--recent-only")
const MERGE_PREV = process.argv.includes("--merge-prev")
const tickersArg = process.argv.find((a) => a.startsWith("--tickers="))
const ONLY_TICKERS = tickersArg ? tickersArg.split("=")[1].split(",").map((t) => t.trim().toUpperCase()).filter(Boolean) : null
const limitArg = process.argv.find((a) => a.startsWith("--limit="))
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : null

const CONCURRENCY = 5
const STAGGER_MS = 120
const TIMEOUT_MS = 25_000
const USER_AGENT = "EGX-Scanner-data-sync/1.0 (+public disclosure aggregation)"
const CURRENT_YEAR = new Date().getUTCFullYear()

const ITEM_TO_METRIC = {
  net_profit: "NET_PROFIT",
  gross_profit: "GROSS_PROFIT",
  total_assets: "TOTAL_ASSETS",
  total_liabilities: "TOTAL_LIABILITIES",
  total_equity: "TOTAL_EQUITY",
  total_liabilities_and_equity: "TOTAL_EQUITY_AND_LIABILITIES",
  cf_operating: "OPERATING_CASH_FLOW",
  cf_investing: "INVESTING_CASH_FLOW",
  cf_financing: "FINANCING_CASH_FLOW",
  net_change_in_cash: "NET_CHANGE_IN_CASH",
  dividends_paid: "DIVIDENDS_PAID",
}
const AR_LABEL = {
  NET_PROFIT: "صافي الربح",
  GROSS_PROFIT: "مجمل الربح",
  TOTAL_ASSETS: "إجمالي الأصول",
  TOTAL_LIABILITIES: "إجمالي المطلوبات",
  TOTAL_EQUITY: "حقوق المساهمين",
  TOTAL_EQUITY_AND_LIABILITIES: "إجمالي المطلوبات وحقوق المساهمين",
  OPERATING_CASH_FLOW: "التدفق النقدي التشغيلي",
  INVESTING_CASH_FLOW: "التدفق النقدي الاستثماري",
  FINANCING_CASH_FLOW: "التدفق النقدي التمويلي",
  NET_CHANGE_IN_CASH: "صافي التغير في النقد",
  DIVIDENDS_PAID: "توزيعات نقدية مدفوعة",
}
// Canonical English labels for metrics the importer can write but AR_LABEL
// does not cover — originalLabel is user-visible, so a raw code like
// NET_PROFIT_PARENT must never land in it.
const EN_FALLBACK = {
  REVENUE: "Revenue",
  COGS: "Cost of Sales",
  GROSS_PROFIT: "Gross Profit",
  OPERATING_EXPENSES_TOTAL: "Total Operating Expenses",
  OPERATING_INCOME: "Operating Income",
  EBIT: "EBIT",
  EBITDA: "EBITDA",
  NET_PROFIT_PARENT: "Net Profit Attributable to Parent",
  PROFIT_BEFORE_TAX: "Profit Before Tax",
  INCOME_TAX: "Income Tax Expense",
  INTEREST_INCOME: "Interest Income",
  INTEREST_EXPENSE: "Interest Expense",
  NET_INTEREST_INCOME: "Net Interest Income",
  BASIC_EPS: "Basic Earnings Per Share",
  DILUTED_EPS: "Diluted Earnings Per Share",
  DIVIDEND_PER_SHARE: "Dividend Per Share",
  SHARES_OUTSTANDING: "Shares Outstanding",
  SHARE_CAPITAL: "Share Capital",
  TREASURY_SHARES: "Treasury Shares",
  LONG_TERM_DEBT: "Long-Term Debt",
  SHORT_TERM_DEBT: "Short-Term Debt",
  LEASE_LIABILITIES_NONCURRENT: "Non-Current Lease Liabilities",
  NON_CURRENT_ASSETS: "Non-Current Assets",
  CAPEX: "Capital Expenditure",
  FREE_CASH_FLOW: "Free Cash Flow",
  DEPRECIATION_EXPENSE: "Depreciation & Amortization",
  STOCK_COMPENSATION: "Stock-Based Compensation",
  FX_EFFECT_CASH: "FX Effect on Cash",
  EXTRAORDINARY_ITEMS: "Extraordinary Items",
  OTHER_INCOME: "Other Income",
  ADMIN_EXPENSES: "Administrative Expenses",
  OTHER_PAYABLES: "Other Payables",
  ASSET_SALE_PROCEEDS: "Asset Sale Proceeds",
  CAPITAL_INCREASES_CASH: "Capital Increases (Cash)",
  TREASURY_TRANSACTIONS_CASH: "Treasury Share Transactions (Cash)",
  DIVIDENDS_PAID_COMMON: "Dividends Paid (Common)",
  WORKING_CAPITAL: "Working Capital",
  TOTAL_EQUITY_AND_LIABILITIES_FY: "Total Liabilities and Equity",
}
function prettyCode(code) {
  return String(code)
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}
const FLOW = new Set(["NET_PROFIT", "GROSS_PROFIT", "OPERATING_CASH_FLOW", "INVESTING_CASH_FLOW", "FINANCING_CASH_FLOW", "NET_CHANGE_IN_CASH", "DIVIDENDS_PAID"])
const STOCK = new Set(["TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY", "TOTAL_EQUITY_AND_LIABILITIES"])
const PERIOD_TYPES = ["fy", "q1", "q2", "q3", "q4"]
const FY_END_MONTH_OFFSET = { fy: 12, q1: 3, q2: 6, q3: 9, q4: 12 }

const approx = (a, b) => Math.abs(a - b) <= Math.max(Math.abs(b) * 0.005, 1)
const closeSum = (sum, fy) => Math.abs(sum - fy) <= Math.max(Math.abs(fy) * 0.05, 1_000_000)
const relDiff = (a, b) => (a === 0 || b === 0 ? null : Math.abs(a / b - 1))
const sameSign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0)

// Discrete-quarter gate that tolerates askborsa's missing-quarter contamination
// (a quarter printed with the FY value — usually Q1). `qvals` is [q1,q2,q3,q4],
// `fy` the annual value. Returns true when:
//   • no contamination: ΣQ ≈ FY and no Q1..Q3 equals FY (classic gate), or
//   • exactly one quarter equals FY (and it is not Q4): treat it as missing;
//     the remaining three quarters must not exceed FY beyond tolerance so the
//     implied missing quarter stays plausible.
function discreteCheck(qvals, fy) {
  if (fy === undefined || qvals.some((v) => v === undefined)) return false
  const contaminated = qvals.map((v) => approx(v, fy))
  const nCont = contaminated.filter(Boolean).length
  if (nCont === 0) {
    return closeSum(qvals.reduce((a, b) => a + b, 0), fy)
      && ![qvals[0], qvals[1], qvals[2]].some((v) => approx(v, fy))
      && ![qvals[0], qvals[1], qvals[2]].every((v) => v === 0)
  }
  if (nCont === 1 && !contaminated[3]) {
    const rest = qvals.filter((_, i) => !contaminated[i]).reduce((a, b) => a + b, 0)
    const missing = fy - rest
    const tol = Math.max(Math.abs(fy) * 0.05, 1_000_000)
    // missing quarter must not be strongly negative (rest exceeding the year)
    // nor absurdly large vs the year itself
    return missing >= -tol && missing <= Math.abs(fy) * 1.5 + tol
      && !qvals.filter((_, i) => !contaminated[i]).every((v) => v === 0)
  }
  return false
}

function log(...args) {
  console.log(new Date().toISOString().slice(11, 19), ...args)
}

// ---------------------------------------------------------------- fetching
async function fetchText(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
      signal: controller.signal,
    })
    if (res.status === 404) return { status: 404, html: null }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { status: 200, html: await res.text() }
  } finally {
    clearTimeout(timer)
  }
}

async function fetchWithRetry(url, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fetchText(url)
    } catch (e) {
      if (i === attempts) return { status: 0, error: String(e?.message ?? e) }
      await new Promise((r) => setTimeout(r, 400 * i))
    }
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  let done = 0
  async function worker() {
    while (true) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i])
      done++
      if (done % 50 === 0) log(`  progress ${done}/${items.length}`)
      await new Promise((r) => setTimeout(r, STAGGER_MS))
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

// ---------------------------------------------------------------- parsing
function unescapeNextFlight(html) {
  return html.replace(/\\"/g, '"').replace(/\\\\/g, "\\")
}

function extractPivots(html) {
  const text = unescapeNextFlight(html)
  const start = text.indexOf('[{"period":"')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  let end = -1
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
    } else {
      if (ch === '"') inString = true
      else if (ch === "[") depth++
      else if (ch === "]") {
        depth--
        if (depth === 0) { end = i + 1; break }
      }
    }
  }
  if (end < 0) return null
  try {
    const pivots = JSON.parse(text.slice(start, end))
    if (!Array.isArray(pivots)) return null
    return pivots.filter((p) => p && typeof p.period === "string" && Array.isArray(p.rows))
  } catch {
    return null
  }
}

const AR_MONTHS = { "يناير": 1, "فبراير": 2, "مارس": 3, "أبريل": 4, "ابريل": 4, "مايو": 5, "يونيو": 6, "يوليو": 7, "اغسطس": 8, "أغسطس": 8, "سبتمبر": 9, "اكتوبر": 10, "أكتوبر": 10, "نوفمبر": 11, "ديسمبر": 12 }

function extractOverviewMeta(html) {
  const text = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ")
  const currency = /العملة\s+(EGP|USD)/.exec(text)?.[1]
    ?? (/\bUSD\b|بالدولار/.test(text) ? "USD" : /العملة\s+جنيه|\bEGP\b/.test(text) ? "EGP" : null)
  const fiscalMonthAr = /السنة المالية تبدأ في\s+([^\s·،]+)/.exec(text)?.[1] ?? null
  const fiscalYearStartMonth = fiscalMonthAr ? (AR_MONTHS[fiscalMonthAr] ?? null) : null
  const noStatements = /No summarised financial statements are available|لا توجد قوائم مالية ملخصة/.test(text)
  return { currency, fiscalYearStartMonth, fiscalMonthAr, noStatements }
}

function periodHrefPeriods(html, ticker) {
  const escapedTicker = ticker.replace(/[.*+?^${}()|[\]\\]/g, "\\$")
  const re = new RegExp(`href="/company/${escapedTicker}/(fy|q[1-4])-(\\d{4})"`, "g")
  const out = new Set()
  let m
  while ((m = re.exec(html))) out.add(`${m[1]}-${m[2]}`)
  return [...out]
}

// Statement page: metric blocks in the flight payload.
//   hero card : ["$","div","{id}",{"className":"card ...
//   table row : ["$","div","{id}",{"className":"grid grid-cols... (current, prior, delta)
function parseStatementPage(html, ticker) {
  // each push wraps one JS string literal; match it atomically so an escaped
  // quote or an inner "]" never truncates the chunk
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)].map((m) => m[1])
  if (!chunks.length) return { metrics: {}, otherPeriods: [], parsed: false }
  const flight = unescapeNextFlight(chunks.join(""))

  // block boundaries: every ["$","div","<id>",{"className":"card|grid...
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

// ---------------------------------------------------------------- calendar
function periodEnd(periodKey, year, startMonth) {
  const sm = startMonth && startMonth >= 1 && startMonth <= 12 ? startMonth : 1
  const startYear = sm === 1 ? year : year - 1
  const monthAfter = sm - 1 + FY_END_MONTH_OFFSET[periodKey]
  return new Date(Date.UTC(startYear, monthAfter, 0))
}
function periodStart(end) {
  // fiscal year spans ~12 months ending at `end`; start = 1st of the month 11 back
  const d = new Date(end.getTime())
  d.setUTCMonth(d.getUTCMonth() - 11)
  d.setUTCDate(1)
  return d
}
function quarterStart(end) {
  const d = new Date(end.getTime())
  d.setUTCMonth(d.getUTCMonth() - 2)
  d.setUTCDate(1)
  return d
}
const isFuture = (d) => d.getTime() > Date.now() + 86_400_000

// ---------------------------------------------------------------- harvest
async function harvest(tickers) {
  log(`harvest: fetching ${tickers.length} overview pages`)
  const overviews = await mapLimit(tickers, CONCURRENCY, async (ticker) => {
    const url = `https://askborsa.com/company/${encodeURIComponent(ticker)}`
    const res = await fetchWithRetry(url)
    if (res.status === 404) return { ticker, status: "not_found" }
    if (res.status !== 200) return { ticker, status: "fetch_failed", error: res.error ?? `HTTP ${res.status}` }
    const meta = extractOverviewMeta(res.html)
    const pivots = extractPivots(res.html)
    const periods = periodHrefPeriods(res.html, ticker)
    return { ticker, status: "ok", url, ...meta, pivots: pivots ?? [], overviewPeriods: periods }
  })

  // build statement-page fetch plan
  const fetchPlan = new Map() // ticker -> Set(periodKey "q3-2026")
  for (const o of overviews) {
    if (o.status !== "ok") continue
    const set = new Set()
    const covered = new Set()
    for (const p of o.pivots ?? []) {
      for (const y of p.years ?? []) {
        const key = `${p.period.toLowerCase()}-${y}`
        covered.add(key)
        // pivot-covered periods still get a page fetch when the pivot row set
        // is thin (pivot lacks stock/cf rows for that period) — skip for now;
        // comparatives from newer pages backfill older years anyway.
      }
    }
    for (const key of o.overviewPeriods ?? []) if (!covered.has(key)) set.add(key)
    // generated candidates: years beyond each pivot window up to CURRENT_YEAR
    const maxByType = {}
    for (const p of o.pivots ?? []) {
      const t = p.period.toLowerCase()
      for (const y of p.years ?? []) maxByType[t] = Math.max(maxByType[t] ?? 0, y)
    }
    for (const t of PERIOD_TYPES) {
      // no pivot at all → probe a bounded recent window (2023+) and let BFS find older
      const from = maxByType[t] ? maxByType[t] + 1 : 2023
      for (let y = Math.max(from, 2019); y <= CURRENT_YEAR; y++) {
        const key = `${t}-${y}`
        if (!covered.has(key)) set.add(key)
      }
    }
    if (RECENT_ONLY) {
      for (const key of [...set]) if (Number(key.split("-")[1]) < CURRENT_YEAR) set.delete(key)
    }
    fetchPlan.set(o.ticker, set)
  }

  let pages = [...fetchPlan.entries()].flatMap(([t, keys]) => [...keys].map((k) => ({ ticker: t, key: k })))
  log(`statement pages to fetch (wave 1): ${pages.length}`)

  const pageData = new Map() // `${ticker}|${key}` -> { metrics, otherPeriods }
  async function fetchStatementWave(items) {
    await mapLimit(items, CONCURRENCY, async ({ ticker, key }) => {
      const id = `${ticker}|${key}`
      const url = `https://askborsa.com/company/${encodeURIComponent(ticker)}/${key}`
      const res = await fetchWithRetry(url)
      if (res.status !== 200) {
        pageData.set(id, { status: res.status === 404 ? "missing" : "fetch_failed", error: res.error })
        return
      }
      const parsed = parseStatementPage(res.html, ticker)
      pageData.set(id, { status: "ok", url, ...parsed })
    })
  }
  await fetchStatementWave(pages)

  // BFS wave 2: "فترات أخرى" links discovered on fetched pages, not yet covered
  const wave2 = []
  for (const [id, d] of pageData) {
    if (d.status !== "ok") continue
    const [ticker] = id.split("|")
    const plan = fetchPlan.get(ticker) ?? new Set()
    for (const key of d.otherPeriods ?? []) {
      if (RECENT_ONLY && Number(key.split("-")[1]) < CURRENT_YEAR) continue
      if (!plan.has(key) && !pageData.has(`${ticker}|${key}`)) {
        plan.add(key)
        wave2.push({ ticker, key })
      }
    }
  }
  if (wave2.length) {
    log(`statement pages to fetch (wave 2, discovered links): ${wave2.length}`)
    await fetchStatementWave(wave2)
  }

  // merge everything into a unified snapshot
  const results = []
  for (const o of overviews) {
    const out = {
      ticker: o.ticker,
      status: o.status,
      currency: o.currency ?? null,
      fiscalYearStartMonth: o.fiscalYearStartMonth ?? null,
      fiscalMonthAr: o.fiscalMonthAr ?? null,
      sourceUrl: o.url ?? null,
      periods: {}, // "q3-2026" -> { metric: {value, source} }
      pagePriors: {}, // "q2-2026" -> { metric: prior-year comparative printed on the page }
      pivotCovered: [],
    }
    if (o.status === "ok") {
      for (const p of o.pivots ?? []) {
        const t = p.period.toLowerCase()
        for (const y of p.years ?? []) {
          const key = `${t}-${y}`
          out.pivotCovered.push(key)
          const bucket = out.periods[key] ??= {}
          for (const row of p.rows ?? []) {
            const metric = ITEM_TO_METRIC[row.item]
            if (!metric) continue
            const v = row.values?.[String(y)]
            if (v === null || v === undefined || !Number.isFinite(Number(v)) || Number(v) === 0) continue
            bucket[metric] = { value: Number(v), source: "pivot" }
          }
        }
      }
    }
    for (const [id, d] of pageData) {
      if (!id.startsWith(`${o.ticker}|`) || d.status !== "ok") continue
      const key = id.split("|")[1]
      const bucket = out.periods[key] ??= {}
      for (const [metric, vals] of Object.entries(d.metrics ?? {})) {
        if (vals.current !== undefined && Number.isFinite(vals.current) && vals.current !== 0) {
          // keep the pivot value alongside: the cash-flow identity resolver
          // below arbitrates when the page value contradicts the pivot
          const pivotValue = bucket[metric]?.source === "pivot" ? bucket[metric].value : undefined
          bucket[metric] = { value: vals.current, source: "statement", ...(pivotValue !== undefined ? { pivotValue } : {}) }
        }
        if (vals.prior !== undefined && Number.isFinite(vals.prior) && vals.prior !== 0) {
          ;(out.pagePriors[key] ??= {})[metric] = vals.prior
        }
      }
      // prior-year comparative fills gaps only
      const [t, yStr] = key.split("-")
      const priorKey = `${t}-${Number(yStr) - 1}`
      if (Number(yStr) - 1 >= 2015) {
        const priorBucket = out.periods[priorKey] ??= {}
        for (const [metric, vals] of Object.entries(d.metrics ?? {})) {
          if (vals.prior === undefined || !Number.isFinite(vals.prior) || vals.prior === 0) continue
          if (!priorBucket[metric]) priorBucket[metric] = { value: vals.prior, source: "comparative" }
        }
      }
    }
    resolveCashIdentities(out)
    results.push(out)
  }

  const summary = {}
  for (const r of results) summary[r.status] = (summary[r.status] ?? 0) + 1
  const periodsFetched = [...pageData.values()].filter((d) => d.status === "ok").length
  log(`harvest done: companies=${JSON.stringify(summary)}, statementPagesOK=${periodsFetched}`)
  return { generatedAt: new Date().toISOString(), currentYear: CURRENT_YEAR, summary, statementPagesFetched: periodsFetched, results }
}

// ---------------------------------------------------------------- cash-flow identity
// ΔCash = CFO + CFI + CFF (+FX effects, absorbed by tolerance). When a quarter
// bucket's page value contradicts its pivot value (live case: ABUK q1-2026 page
// printed the FY2025 CFI copy while the pivot row carried the real Q1 value),
// pick per-metric candidates so the identity holds; prefer keeping merged
// (statement) values when both variants satisfy it.
const CF_SET = ["OPERATING_CASH_FLOW", "INVESTING_CASH_FLOW", "FINANCING_CASH_FLOW", "NET_CHANGE_IN_CASH"]
function resolveCashIdentities(out) {
  for (const bucket of Object.values(out.periods)) {
    const present = CF_SET.filter((m) => bucket[m])
    if (!bucket.NET_CHANGE_IN_CASH || present.length < 3) continue
    const cands = {}
    for (const m of present) {
      const arr = [bucket[m].value]
      if (bucket[m].pivotValue !== undefined && bucket[m].pivotValue !== bucket[m].value) arr.push(bucket[m].pivotValue)
      cands[m] = arr
    }
    const keys = Object.keys(cands)
    let best = null // { combo, replacements }
    const rec = (i, combo) => {
      if (i === keys.length) {
        const val = Object.fromEntries(combo)
        const sum = (val.OPERATING_CASH_FLOW ?? 0) + (val.INVESTING_CASH_FLOW ?? 0) + (val.FINANCING_CASH_FLOW ?? 0)
        const delta = val.NET_CHANGE_IN_CASH
        const ok = Math.abs(delta - sum) <= Math.max(Math.abs(delta) * 0.05, 2_000_000)
        if (!ok) return
        const replacements = keys.filter((k) => val[k] !== bucket[k].value).length
        if (!best || replacements < best.replacements) best = { combo: val, replacements }
        return
      }
      for (const v of cands[keys[i]]) rec(i + 1, [...combo, [keys[i], v]])
    }
    rec(0, [])
    if (best) {
      for (const [m, v] of Object.entries(best.combo)) {
        if (v !== bucket[m].value) bucket[m] = { value: v, source: "pivot", identityResolved: true }
      }
    }
  }
}

// ---------------------------------------------------------------- pattern votes
// Per (ticker, metric): vote "discrete" | "cumulative" | null from years where
// the full flow series + FY value exist on AskBorsa.
function votePatterns(snapshot) {
  const votes = new Map() // ticker -> metric -> { discrete, cumulative, years: [] }
  for (const r of snapshot.results) {
    if (r.status !== "ok") continue
    // collect per fiscal year flow series: values for q1..q4 + fy
    const byYear = new Map()
    for (const [key, bucket] of Object.entries(r.periods)) {
      const [t, yStr] = key.split("-")
      const y = Number(yStr)
      for (const metric of FLOW) {
        const v = bucket[metric]?.value
        if (v === undefined || !Number.isFinite(v) || v === 0) continue
        if (!byYear.has(y)) byYear.set(y, {})
        const rec = byYear.get(y)
        ;(rec[t] ??= {})[metric] = v
      }
    }
    for (const [y, rec] of byYear) {
      const fyVals = rec.fy ?? {}
      for (const metric of FLOW) {
        const fy = fyVals[metric]
        if (fy === undefined) continue
        const qs = ["q1", "q2", "q3", "q4"].map((t) => rec[t]?.[metric])
        if (qs.some((v) => v === undefined)) continue // need full series
        const [q1, q2, q3, q4] = qs
        let vote = null
        if (discreteCheck(qs, fy)) {
          vote = "discrete"
        } else {
          // cumulative: same sign, |magnitudes| non-decreasing, terminal ≈ FY
          const series = [q1, q2, q3, q4]
          const signs = series.map(sameSign)
          const sign = signs.find((s) => s !== 0)
          const monotone = sign !== undefined && signs.every((s) => s === sign || s === 0)
            && series.every((v, i) => i === 0 || Math.abs(v) >= Math.abs(series[i - 1]) * 0.995)
          const terminalOk = approx(q4, fy) && Math.abs(q4 / fy - 1) <= 0.01
          const accumulation = Math.abs(q3) >= Math.abs(q1) * 1.2
          if (monotone && terminalOk && accumulation) vote = "cumulative"
        }
        if (vote) {
          if (!votes.has(r.ticker)) votes.set(r.ticker, {})
          const v = votes.get(r.ticker)
          v[metric] ??= { discrete: 0, cumulative: 0, years: [] }
          v[metric][vote]++
          v[metric].years.push(`${y}:${vote}`)
        }
      }
    }
  }
  const patterns = new Map()
  for (const [ticker, byMetric] of votes) {
    for (const [metric, v] of Object.entries(byMetric)) {
      const winner = v.discrete === v.cumulative ? null : (v.discrete > v.cumulative ? "discrete" : "cumulative")
      patterns.set(`${ticker}|${metric}`, { pattern: winner, discrete: v.discrete, cumulative: v.cumulative })
    }
  }
  return patterns
}

// ---------------------------------------------------------------- plan
function reportKey(pt, label) {
  return `${pt}|${label}`
}

async function buildPlan(snapshot, patterns, fiscalByTicker) {
  const companies = await db.company.findMany({
    where: { isActive: true, ...(ONLY_TICKERS ? { ticker: { in: ONLY_TICKERS } } : {}) },
    select: { id: true, ticker: true, nameEn: true },
  })
  const byTicker = new Map(companies.map((c) => [c.ticker, c]))

  const reports = await db.financialReport.findMany({
    where: {
      companyId: { in: companies.map((c) => c.id) },
      deletedAt: null,
      isDemoData: false,
      processingStatus: { notIn: ["FAILED", "REJECTED", "DELETED"] },
      periodType: { in: ["ANNUAL", "QUARTERLY", "SEMIANNUAL", "NINE_MONTH"] },
    },
    select: {
      id: true, companyId: true, periodType: true, periodLabel: true, fiscalYear: true,
      statementType: true, processingStatus: true, createdAt: true, supersedesId: true,
      values: { select: { metricCode: true, subPeriod: true, normalizedValue: true, validationStatus: true } },
    },
  })
  const superseded = new Set(reports.map((r) => r.supersedesId).filter(Boolean))
  const statusRank = { APPROVED: 0, VALIDATED: 1, EXTRACTED: 2 }
  const existing = new Map() // companyId -> Map(reportKey -> report)
  for (const r of reports) {
    if (superseded.has(r.id)) continue
    if (r.statementType !== "CONSOLIDATED") continue
    const per = existing.get(r.companyId) ?? new Map()
    const key = reportKey(r.periodType, r.periodLabel)
    const prev = per.get(key)
    if (!prev || (statusRank[r.processingStatus] ?? 9) < (statusRank[prev.processingStatus] ?? 9)) per.set(key, r)
    existing.set(r.companyId, per)
  }

  // app annual values (per company per metric, nearest-year reference) — used
  // for the company-level scale gate and per-value sanity checks
  const appAnnualVals = new Map() // companyId -> metric -> [{year, value}]
  for (const [companyId, per] of existing) {
    for (const r of per.values()) {
      if (r.periodType !== "ANNUAL") continue
      for (const v of r.values) {
        if (!Number.isFinite(v.normalizedValue) || v.normalizedValue === 0) continue
        if (v.subPeriod !== "CURRENT" && v.subPeriod !== null) continue
        const m = appAnnualVals.get(companyId) ?? new Map()
        const arr = m.get(v.metricCode) ?? []
        arr.push({ year: r.fiscalYear, value: v.normalizedValue })
        m.set(v.metricCode, arr)
        appAnnualVals.set(companyId, m)
      }
    }
  }

  const plan = []
  const skipped = []
  const conflicts = []
  const skip = (ticker, key, metric, reason) => skipped.push({ ticker, period: key, metric, reason })

  for (const r of snapshot.results) {
    const company = byTicker.get(r.ticker)
    if (!company) { skipped.push({ ticker: r.ticker, period: null, metric: null, reason: "NO_DB_COMPANY" }); continue }
    if (r.status !== "ok") { skipped.push({ ticker: r.ticker, period: null, metric: null, reason: `ASK_${r.status.toUpperCase()}` }); continue }
    if (r.currency && r.currency !== "EGP") { skipped.push({ ticker: r.ticker, period: null, metric: null, reason: `CURRENCY_${r.currency}` }); continue }
    // fiscal start: DB-inferred (curated annuals) wins over askborsa page metadata
    const sm = fiscalByTicker.get(r.ticker) ?? r.fiscalYearStartMonth ?? 1
    if (fiscalByTicker.has(r.ticker) && r.fiscalYearStartMonth && fiscalByTicker.get(r.ticker) !== r.fiscalYearStartMonth) {
      log(`  fiscal override ${r.ticker}: DB says start month ${fiscalByTicker.get(r.ticker)} (askborsa metadata: ${r.fiscalYearStartMonth})`)
    }
    const per = existing.get(company.id) ?? new Map()
    const annualRef = appAnnualVals.get(company.id) ?? new Map()

    // company-level scale gate: if EVERY overlapping (metric, FY year) pair
    // between AskBorsa and the app's own annuals disagrees by >10x, AskBorsa is
    // printing this company in a different unit (documented thousands cases:
    // BQDC/IRON) — skip the company entirely instead of importing bad scale.
    {
      const pairs = []
      for (const [key, bucket] of Object.entries(r.periods)) {
        if (!key.startsWith("fy-")) continue
        const y = Number(key.slice(3))
        for (const [metric, v] of Object.entries(bucket)) {
          const refs = annualRef.get(metric)
          const app = refs?.find((a) => a.year === y)?.value
          if (app === undefined || !Number.isFinite(v.value) || v.value === 0) continue
          pairs.push({ metric, y, ask: v.value, app, ratio: app / v.value })
        }
      }
      if (pairs.length && pairs.every((p) => !(p.ratio >= 0.1 && p.ratio <= 10))) {
        skipped.push({ ticker: r.ticker, period: null, metric: null, reason: `COMPANY_SCALE_MISMATCH (${pairs.length} pairs, e.g. ${pairs[0].metric} ${pairs[0].y} app/ask=${pairs[0].ratio.toExponential(1)})` })
        continue
      }
    }

    // group periods by fiscal year
    const years = new Map()
    for (const [key, bucket] of Object.entries(r.periods)) {
      const [t, yStr] = key.split("-")
      const y = Number(yStr)
      if (!Number.isFinite(y) || y < 2015 || y > CURRENT_YEAR + 1) continue
      if (!years.has(y)) years.set(y, {})
      const rec = years.get(y)
      rec[t] = { key, bucket }
    }

    for (const [y, rec] of [...years.entries()].sort((a, b) => b[0] - a[0])) {
      const fyRec = rec.fy
      const fyEnd = periodEnd("fy", y, sm)

      // ---- ANNUAL: create missing FY report (or fill missing slots)
      if (fyRec && !isFuture(fyEnd)) {
        const annualValues = Object.entries(fyRec.bucket)
          .filter(([metric, v]) => Number.isFinite(v.value) && v.value !== 0)
          .map(([metric, v]) => ({ metric, value: v.value, source: v.source }))
        const existingAnnual = per.get(reportKey("ANNUAL", `FY ${y}`))
        if (!existingAnnual) {
          if (annualValues.length >= 3) {
            plan.push({
              action: "CREATE_REPORT", kind: "ANNUAL", ticker: r.ticker, companyId: company.id,
              periodType: "ANNUAL", periodLabel: `FY ${y}`, fiscalYear: y,
              periodStart: periodStart(fyEnd).toISOString(), periodEnd: fyEnd.toISOString(),
              sourceUrl: r.sourceUrl, confidence: 0.8, verifiedBy: "ANNUAL_FILL",
              values: annualValues.map((v) => ({ metric: v.metric, value: v.value, verifiedBy: "ANNUAL_FILL" })),
            })
          } else skip(r.ticker, `fy-${y}`, null, `ANNUAL_TOO_THIN (${annualValues.length} values)`)
        } else {
          const have = new Set(existingAnnual.values
            .filter((v) => v.subPeriod === "CURRENT" || v.subPeriod === null)
            .map((v) => v.metricCode))
          const fills = annualValues.filter((v) => !have.has(v.metric))
          for (const v of fills) {
            plan.push({
              action: "ADD_VALUE", kind: "ANNUAL", ticker: r.ticker, companyId: company.id,
              reportId: existingAnnual.id, reportKey: `FY ${y}`, fiscalYear: y,
              sourceUrl: r.sourceUrl, confidence: 0.8, verifiedBy: "ANNUAL_SLOT_FILL",
              values: [{ metric: v.metric, value: v.value, verifiedBy: "ANNUAL_SLOT_FILL" }],
            })
          }
          // conflict scan on existing annual slots
          for (const v of annualValues) {
            const ex = existingAnnual.values.find((x) => x.metricCode === v.metric && (x.subPeriod === "CURRENT" || x.subPeriod === null) && Number.isFinite(x.normalizedValue))
            if (ex) {
              const d = relDiff(v.value, ex.normalizedValue)
              if (d !== null && d > 0.05) conflicts.push({ ticker: r.ticker, period: `FY ${y}`, metric: v.metric, askValue: v.value, appValue: ex.normalizedValue, relDiff: Number(d.toFixed(4)), askSource: v.source })
            }
          }
        }
      }

      // ---- QUARTERS
      for (const t of ["q1", "q2", "q3", "q4"]) {
        const qRec = rec[t]
        if (!qRec) continue
        const end = periodEnd(t, y, sm)
        if (isFuture(end)) { skip(r.ticker, qRec.key, null, "FUTURE_PERIOD"); continue }
        const qi = { q1: 1, q2: 2, q3: 3, q4: 4 }[t]

        // stock metrics → QUARTERLY report, point-in-time
        const stockValues = []
        for (const metric of STOCK) {
          const v = qRec.bucket[metric]?.value
          if (v === undefined || v === 0) continue
          if (t === "q4") {
            // Q4 balance sheet ≡ FY balance sheet; require the ask FY value
            const fyv = fyRec?.bucket[metric]?.value
            if (fyv === undefined) { skip(r.ticker, qRec.key, metric, "Q4_STOCK_NO_ASK_FY"); continue }
            if (!approx(v, fyv)) { skip(r.ticker, qRec.key, metric, "Q4_STOCK_NE_ASK_FY"); continue }
            stockValues.push({ metric, value: v, verifiedBy: "Q4_STOCK_EQ_FY" })
            continue
          }
          const fyv = fyRec?.bucket[metric]?.value
          if (fyv !== undefined && approx(v, fyv)) { skip(r.ticker, qRec.key, metric, "Q_STOCK_EQ_FY_COPY"); continue }
          // scale sanity vs ask FY, else app's nearest annual
          const ref = fyv ?? nearestAnnual(annualRef.get(metric), y)
          if (ref === undefined) { skip(r.ticker, qRec.key, metric, "STOCK_NO_REFERENCE"); continue }
          const ratio = Math.abs(v) / Math.abs(ref)
          if (!(ratio >= 0.1 && ratio <= 10)) { skip(r.ticker, qRec.key, metric, `STOCK_SCALE_SUSPECT (${ratio.toFixed(2)}x)`); continue }
          stockValues.push({ metric, value: v, verifiedBy: "POINT_IN_TIME" })
        }

        // flow metrics → discrete QUARTERLY or cumulative (H1/9M) reports
        const flowByTarget = new Map() // "QUARTERLY|Q3 2026" -> values[]
        const askFyExists = fyRec !== undefined
        for (const metric of FLOW) {
          const v = qRec.bucket[metric]?.value
          if (v === undefined || v === 0) continue
          // annual-copy guard: a quarter flow equal to the year's FY value is
          // askborsa's missing-quarter contamination — never import it (the
          // FY annual report already carries that number)
          const fyv = fyRec?.bucket[metric]?.value
          if (fyv !== undefined && approx(v, fyv)) { skip(r.ticker, qRec.key, metric, "FLOW_EQ_FY_COPY"); continue }
          let target = null
          let verifiedBy = null
          if (askFyExists) {
            // year-specific gate from askborsa's own data (tolerates a
            // missing-quarter FY-copy, e.g. contaminated Q1 rows)
            const qvals = ["q1", "q2", "q3", "q4"].map((tt) => rec[tt]?.bucket[metric]?.value)
            const fy = fyRec.bucket[metric]?.value
            if (fy !== undefined && discreteCheck(qvals, fy)) {
              target = { pt: "QUARTERLY", label: `${t.toUpperCase().replace("Q", "Q")} ${y}` }
              verifiedBy = "SUM_TO_FY"
            } else {
              const cum = cumulativeCheck(rec, metric, fy)
              if (cum) {
                const tgt = { q1: ["QUARTERLY", `Q1 ${y}`], q2: ["SEMIANNUAL", `H1 ${y}`], q3: ["NINE_MONTH", `9M ${y}`], q4: null }[t]
                if (tgt) { target = { pt: tgt[0], label: tgt[1] }; verifiedBy = "CUMULATIVE_SERIES" }
              }
            }
            if (!target && !fy) skip(r.ticker, qRec.key, metric, "FLOW_GATE_FAILED_HISTORICAL")
            if (!target && fy) { /* discrete failed & cumulative failed for a metric with FY: only flag when full series existed */
              const full = ["q1", "q2", "q3", "q4"].every((tt) => rec[tt]?.bucket[metric]?.value !== undefined)
              if (full) skip(r.ticker, qRec.key, metric, "FLOW_GATE_FAILED_FULL_SERIES")
            }
          } else {
            // current year (no ask FY yet): the statement page declares its own
            // convention through the prior-year comparative it prints:
            //   prior ≈ prior-year same quarter           → discrete quarter
            //   prior ≈ FY_prev − later prior quarters    → cumulative (H1/9M)
            // Live case: ABUK q2-2026 prints H1-2026 (10.01B, +119% YoY) against
            // H1-2025 (4.57B = FY2025 − Q3 − Q4), not Q2-2025 (3.16B).
            // prior comparative: the value printed on THIS period's page (its
            // same-quarter prior-year comparative) — classifies the page as
            // discrete vs cumulative. Fallback: prior-year bucket value.
            const priorVal = r.pagePriors?.[qRec.key]?.[metric] ?? r.periods[`${t}-${y - 1}`]?.[metric]?.value
            const pat0 = patterns.get(`${r.ticker}|${metric}`)
            const histCumulative = pat0?.pattern === "cumulative"
            if (priorVal !== undefined && priorVal !== 0) {
              const ratio = Math.abs(v) / Math.abs(priorVal)
              if (!(ratio >= 0.05 && ratio <= 20)) { skip(r.ticker, qRec.key, metric, `FLOW_PRIOR_RATIO_SUSPECT (${ratio.toFixed(2)}x)`); continue }
              const prevRec = years.get(y - 1)
              const prevFy = prevRec?.fy?.bucket[metric]?.value
              // discrete candidate: prior comparative equals the prior-year
              // same-quarter value (rejected when history votes cumulative —
              // for cumulative issuers the prior-year quarter bucket IS the
              // cumulative span, so the match is meaningless)
              const priorSameQ = prevRec?.[t]?.bucket[metric]?.value
              const dDisc = priorSameQ !== undefined && priorSameQ !== 0 ? relDiff(priorVal, priorSameQ) : null
              const discreteMatch = !histCumulative && dDisc !== null && dDisc <= 0.05
              // cumulative candidate: prior comparative equals the reconstructed
              // prior-year cumulative span (H1 = FY−Q3−Q4, 9M = FY−Q4)
              let cumMatch = false
              if (!discreteMatch && prevFy !== undefined && (t === "q2" || t === "q3")) {
                const later = t === "q2"
                  ? ["q3", "q4"].map((tt) => prevRec[tt]?.bucket[metric]?.value)
                  : [prevRec.q4?.bucket[metric]?.value]
                if (later.every((x) => x !== undefined)) {
                  const span = prevFy - later.reduce((a, b) => a + b, 0)
                  const dCum = relDiff(priorVal, span)
                  cumMatch = dCum !== null && dCum <= 0.05
                }
              }
              if (discreteMatch) {
                target = { pt: "QUARTERLY", label: `${t.toUpperCase()} ${y}` }
                verifiedBy = "PAGE_PRIOR_DISCRETE_MATCH"
              } else if (cumMatch) {
                const tgt = { q2: ["SEMIANNUAL", `H1 ${y}`], q3: ["NINE_MONTH", `9M ${y}`] }[t]
                target = { pt: tgt[0], label: tgt[1] }
                verifiedBy = "PAGE_CUMULATIVE"
              }
            }
            if (!target) {
              // fall back to the historical pattern vote
              const pat = patterns.get(`${r.ticker}|${metric}`)
              if (!pat?.pattern) { skip(r.ticker, qRec.key, metric, "FLOW_NO_PATTERN"); continue }
              const priorVal2 = r.periods[`${t}-${y - 1}`]?.[metric]?.value
              if (priorVal2 === undefined) { skip(r.ticker, qRec.key, metric, "FLOW_NO_PRIOR_YEAR"); continue }
              const ratio2 = Math.abs(v) / Math.abs(priorVal2)
              if (!(ratio2 >= 0.05 && ratio2 <= 20)) { skip(r.ticker, qRec.key, metric, `FLOW_PRIOR_RATIO_SUSPECT (${ratio2.toFixed(2)}x)`); continue }
              const mono = cumulativeMonotoneUpTo(rec, metric, t)
              if (mono === false) { skip(r.ticker, qRec.key, metric, "FLOW_MONOTONICITY_BROKEN"); continue }
              if (pat.pattern === "discrete") {
                target = { pt: "QUARTERLY", label: `${t.toUpperCase()} ${y}` }
                verifiedBy = "PATTERN_DISCRETE"
              } else if (pat.pattern === "cumulative") {
                if (t === "q4") { skip(r.ticker, qRec.key, metric, "CUMULATIVE_Q4_COVERED_BY_FY"); continue }
                const tgt = { q1: ["QUARTERLY", `Q1 ${y}`], q2: ["SEMIANNUAL", `H1 ${y}`], q3: ["NINE_MONTH", `9M ${y}`] }[t]
                target = { pt: tgt[0], label: tgt[1] }
                verifiedBy = "PATTERN_CUMULATIVE"
              }
            }
          }
          if (!target) continue
          const tk = `${target.pt}|${target.label}`
          const arr = flowByTarget.get(tk) ?? []
          arr.push({ metric, value: v, verifiedBy })
          flowByTarget.set(tk, arr)

          // exact discrete-quarter derivation from a cumulative value
          // (Q2 = H1 − Q1, Q3 = 9M − H1). The identity is arithmetically exact;
          // the generic annual-scale sanity band below still applies.
          if ((t === "q2" || t === "q3")
              && (verifiedBy === "PAGE_CUMULATIVE" || verifiedBy === "CUMULATIVE_SERIES" || verifiedBy === "PATTERN_CUMULATIVE")) {
            const prevCum = t === "q2" ? rec.q1?.bucket[metric]?.value : rec.q2?.bucket[metric]?.value
            if (prevCum !== undefined && prevCum !== 0) {
              const derived = v - prevCum
              if (Number.isFinite(derived) && derived !== 0 && Math.abs(derived) <= Math.abs(v) * 3 + 1_000_000) {
                const dtk = `QUARTERLY|${t.toUpperCase()} ${y}`
                const darr = flowByTarget.get(dtk) ?? []
                darr.push({ metric, value: derived, verifiedBy: t === "q2" ? "CUM_MINUS_Q1" : "CUM_MINUS_H1" })
                flowByTarget.set(dtk, darr)
              }
            }
          }
        }

        // emit plans for this quarter
        const targets = new Map()
        if (stockValues.length) targets.set(`QUARTERLY|${t.toUpperCase()} ${y}`, { pt: "QUARTERLY", label: `${t.toUpperCase()} ${y}`, values: stockValues })
        for (const [tk, vals] of flowByTarget) {
          const [pt, label] = tk.split("|")
          const ex = targets.get(tk)
          if (ex) ex.values.push(...vals)
          else targets.set(tk, { pt, label, values: vals })
        }
        for (const [tk, spec] of targets) {
          const existingReport = per.get(reportKey(spec.pt, spec.label))
          // per-value sanity vs the app's own annuals of the same metric.
          // flows get a wider band than stocks: seasonal quarters can be a
          // tiny fraction of the year (GPIM Q1 ≈ 4% of FY), while a balance
          // sheet cannot plausibly collapse to 5% year-over-year. Real unit
          // errors are ~1000x and are blocked by both bands.
          const saneValues = []
          for (const v of spec.values) {
            const ref = nearestAnnual(annualRef.get(v.metric), y)
            if (ref === undefined) { saneValues.push(v); continue }
            const ratio = Math.abs(v.value) / Math.abs(ref)
            const [lo, hi] = FLOW.has(v.metric) ? [0.01, 50] : [0.05, 20]
            if (ratio >= lo && ratio <= hi) saneValues.push(v)
            else skip(r.ticker, qRec.key, v.metric, `VALUE_SCALE_VS_APP (${ratio.toExponential(1)}x vs ${v.metric} annual)`)
          }
          if (!saneValues.length) continue
          spec.values = saneValues
          // a Q4 report carrying ONLY point-in-time stock values would just
          // duplicate the annual balance sheet — never create it
          if (!existingReport && t === "q4" && !spec.values.some((v) => FLOW.has(v.metric))) {
            skip(r.ticker, qRec.key, null, "Q4_STOCK_ONLY_NO_REPORT")
            continue
          }
          if (!existingReport) {
            plan.push({
              action: "CREATE_REPORT", kind: "QUARTER", ticker: r.ticker, companyId: company.id,
              periodType: spec.pt, periodLabel: spec.label, fiscalYear: y,
              periodStart: periodStartDate(spec.pt, end).toISOString(), periodEnd: end.toISOString(),
              sourceUrl: r.sourceUrl, confidence: spec.values.some((v) => String(v.verifiedBy).startsWith("PATTERN") || String(v.verifiedBy).startsWith("CUM_MINUS")) ? 0.7 : 0.8,
              verifiedBy: spec.values.map((v) => v.verifiedBy).join("+"),
              values: spec.values,
            })
          } else {
            const have = new Set(existingReport.values
              .filter((v) => v.subPeriod === "CURRENT" || v.subPeriod === null)
              .map((v) => v.metricCode))
            const fills = spec.values.filter((v) => !have.has(v.metric))
            if (fills.length) {
              plan.push({
                action: "ADD_VALUE", kind: "QUARTER", ticker: r.ticker, companyId: company.id,
                reportId: existingReport.id, reportKey: spec.label, fiscalYear: y,
                sourceUrl: r.sourceUrl, confidence: fills.some((v) => String(v.verifiedBy).startsWith("PATTERN")) ? 0.7 : 0.8,
                verifiedBy: fills.map((v) => v.verifiedBy).join("+"),
                values: fills,
              })
            }
            for (const v of spec.values) {
              const exV = existingReport.values.find((x) => x.metricCode === v.metric && (x.subPeriod === "CURRENT" || x.subPeriod === null) && Number.isFinite(x.normalizedValue))
              if (exV) {
                const d = relDiff(v.value, exV.normalizedValue)
                if (d !== null && d > 0.05) conflicts.push({ ticker: r.ticker, period: spec.label, metric: v.metric, askValue: v.value, appValue: exV.normalizedValue, relDiff: Number(d.toFixed(4)), askSource: "askborsa" })
              }
            }
          }
        }
      }
    }
  }

  return { plan, skipped, conflicts }
}

function nearestAnnual(arr, year) {
  if (!arr?.length) return undefined
  let best
  for (const a of arr) {
    const dist = Math.abs(a.year - year)
    if (!best || dist < best.dist) best = { dist, value: a.value }
  }
  return best.value
}

// period start for interim reports: QUARTERLY spans 3 months, SEMIANNUAL 6,
// NINE_MONTH 9 (the old quarterStart was only correct for 3-month spans)
function periodStartDate(pt, end) {
  const back = { QUARTERLY: 2, SEMIANNUAL: 5, NINE_MONTH: 8 }[pt] ?? 2
  const d = new Date(end.getTime())
  d.setUTCMonth(d.getUTCMonth() - back)
  d.setUTCDate(1)
  return d
}

// Fiscal-year start month inferred from the platform's own curated annuals
// (mode of ANNUAL periodEnd month → start = end + 1 mod 12). AskBorsa's page
// metadata is unreliable for some issuers (ABUK: page claims يناير while every
// filed statement ends June). Falls back to the askborsa metadata, then January.
async function inferFiscalStartByTicker(tickers) {
  const companies = await db.company.findMany({
    where: { ticker: { in: [...tickers] } },
    select: { id: true, ticker: true },
  })
  const tickerById = new Map(companies.map((c) => [c.id, c.ticker]))
  const annuals = await db.financialReport.findMany({
    where: {
      companyId: { in: companies.map((c) => c.id) },
      periodType: "ANNUAL", deletedAt: null, isDemoData: false,
      processingStatus: { in: ["APPROVED", "VALIDATED", "EXTRACTED"] },
    },
    select: { companyId: true, periodEnd: true },
  })
  const votes = new Map() // ticker -> endMonth -> count
  for (const a of annuals) {
    const t = tickerById.get(a.companyId)
    if (!t || !a.periodEnd) continue
    const m = a.periodEnd.getUTCMonth() + 1
    const v = votes.get(t) ?? new Map()
    v.set(m, (v.get(m) ?? 0) + 1)
    votes.set(t, v)
  }
  const out = new Map()
  for (const [t, v] of votes) {
    let best = null
    for (const [m, n] of v) if (!best || n > best.n) best = { m, n }
    out.set(t, (best.m % 12) + 1)
  }
  return out
}

// cumulative check for a year with ask FY: series Q1..Q3 (+Q4 or FY as terminal)
function cumulativeCheck(rec, metric, fy) {
  const vals = ["q1", "q2", "q3"].map((t) => rec[t]?.bucket[metric]?.value)
  if (vals.some((v) => v === undefined || v === 0)) return false
  const q4 = rec.q4?.bucket[metric]?.value
  const series = q4 !== undefined && q4 !== 0 ? [...vals, q4] : [...vals, fy]
  if (series.some((v) => v === undefined || v === 0)) return false
  const sign = sameSign(series[0])
  if (sign === 0) return false
  const monotone = series.every((v) => sameSign(v) === sign) && series.every((v, i) => i === 0 || Math.abs(v) >= Math.abs(series[i - 1]) * 0.995)
  const terminalOk = q4 !== undefined && q4 !== 0 ? approx(q4, fy) && Math.abs(q4 / fy - 1) <= 0.01 : true
  const accumulation = Math.abs(vals[2]) >= Math.abs(vals[0]) * 1.2
  // must NOT pass the discrete sum gate (that case is handled first)
  const allFour = ["q1", "q2", "q3", "q4"].map((t) => rec[t]?.bucket[metric]?.value)
  const discretePass = allFour.every((v) => v !== undefined) && closeSum(allFour.reduce((a, b) => a + b, 0), fy)
  return monotone && terminalOk && accumulation && !discretePass
}

// monotonicity of cumulative pattern up to quarter t (for current-year import)
function cumulativeMonotoneUpTo(rec, metric, upTo) {
  const idx = { q1: 1, q2: 2, q3: 3, q4: 4 }[upTo]
  const series = []
  for (const t of ["q1", "q2", "q3", "q4"].slice(0, idx)) {
    const v = rec[t]?.bucket[metric]?.value
    if (v !== undefined && v !== 0) series.push(v)
  }
  if (series.length < 2) return true // nothing to contradict
  const sign = sameSign(series[0])
  return sign !== 0 && series.every((v) => sameSign(v) === sign) && series.every((v, i) => i === 0 || Math.abs(v) >= Math.abs(series[i - 1]) * 0.995)
}

// ---------------------------------------------------------------- apply
async function applyPlan(plan) {
  mkdirSync("reports", { recursive: true })
  const rollback = { generatedAt: new Date().toISOString(), reports: [], values: [] }
  const blocked = []
  let reportCount = 0
  let valueCount = 0
  for (const p of plan) {
    let reportId
    if (p.action === "CREATE_REPORT") {
      // match the DB unique key exactly (companyId, periodType, periodLabel,
      // statementType, version): soft-deleted / superseded / FAILED rows still
      // occupy the key even though buildPlan's `existing` map ignored them
      const dup = await db.financialReport.findFirst({
        where: { companyId: p.companyId, periodType: p.periodType, periodLabel: p.periodLabel, statementType: "CONSOLIDATED" },
        select: { id: true, deletedAt: true, processingStatus: true },
      })
      if (dup && (dup.deletedAt || ["FAILED", "REJECTED", "DELETED"].includes(dup.processingStatus))) {
        // never resurrect a deliberately removed report
        blocked.push({ ticker: p.ticker, periodLabel: p.periodLabel, reason: dup.deletedAt ? "SOFT_DELETED" : dup.processingStatus })
        continue
      }
      if (dup) {
        reportId = dup.id
      } else {
        const created = await db.financialReport.create({
          data: {
            companyId: p.companyId,
            reportType: p.periodType === "ANNUAL" ? "ANNUAL" : "INTERIM",
            periodType: p.periodType,
            statementType: "CONSOLIDATED",
            fiscalYear: p.fiscalYear,
            periodLabel: p.periodLabel,
            periodStart: new Date(p.periodStart),
            periodEnd: new Date(p.periodEnd),
            language: "AR",
            sourceName: "ASKBORA_PUBLIC",
            sourceUrl: p.sourceUrl,
            processingStatus: "EXTRACTED",
            extractionMethod: "ASKBORA_HARVEST",
            parserVersion: PARSER,
            extractionConfidence: p.confidence,
            isDemoData: false,
            version: 1,
            notes: `AskBorsa public data sync; verified: ${p.verifiedBy}.`,
          },
          select: { id: true },
        })
        reportId = created.id
        rollback.reports.push({ id: reportId, ticker: p.ticker, periodLabel: p.periodLabel })
        reportCount++
      }
    } else {
      reportId = p.reportId
    }
    for (const v of p.values) {
      // final only-missing-slot re-check under concurrency-safe conditions
      const slot = await db.financialValue.findFirst({
        where: { reportId, metricCode: v.metric, OR: [{ subPeriod: "CURRENT" }, { subPeriod: null }] },
        select: { id: true },
      })
      if (slot) continue
      let row
      try {
        row = await db.financialValue.create({
        data: {
          companyId: p.companyId,
          reportId,
          metricCode: v.metric,
          // Product rule: originalLabel is user-visible (bilingual hint on the
          // statements table) — never embed tooling/source refs like
          // "(AskBorsa Qx)" here. Provenance lives in validationNotes instead.
          originalLabel: AR_LABEL[v.metric] ?? EN_FALLBACK[v.metric] ?? prettyCode(v.metric),
          value: v.value,
          currency: "EGP",
          unit: "UNIT",
          normalizedValue: v.value,
          statementType: statementKind(v.metric),
          subPeriod: "CURRENT",
          extractionMethod: "ASKBORA_HARVEST",
          confidence: p.confidence ?? 0.8,
          validationStatus: "VALID",
          validationNotes: `${MARK} ${v.verifiedBy}; source ${p.sourceUrl}`,
          sourceText: p.sourceUrl,
          isDemoData: false,
        },
        select: { id: true },
      })
      } catch (e) {
        // defensive: another unique constraint (e.g. FinancialValue
        // reportId+metricCode+subPeriod) — log and keep going
        if (String(e?.code) === "P2002") { blocked.push({ ticker: p.ticker, periodLabel: p.periodLabel, metric: v.metric, reason: "VALUE_UNIQUE" }); continue }
        throw e
      }
      rollback.values.push({ id: row.id, ticker: p.ticker, metric: v.metric, value: v.value })
      valueCount++
    }
  }
  writeFileSync(ROLLBACK, JSON.stringify(rollback, null, 2), "utf8")
  if (blocked.length) {
    writeFileSync("reports/askborsa-sync-blocked.json", JSON.stringify({ generatedAt: new Date().toISOString(), blocked }, null, 2), "utf8")
    log(`blocked (soft-deleted/failed/unique): ${blocked.length} → reports/askborsa-sync-blocked.json`)
  }
  await db.auditLog.create({
    data: {
      actor: "system",
      action: "UPLOAD",
      entityType: "FinancialReport",
      details: `ASKBORA_SYNC: ${reportCount} reports created, ${valueCount} values added (parser ${PARSER}); rollback ${ROLLBACK}`,
    },
  })
  return { reportCount, valueCount }
}

async function runRollback() {
  if (!existsSync(ROLLBACK)) { console.error(`No rollback file at ${ROLLBACK}`); process.exit(1) }
  const data = JSON.parse(readFileSync(ROLLBACK, "utf8"))
  let values = 0
  let reports = 0
  let skipped = 0
  for (const v of data.values ?? []) {
    const row = await db.financialValue.findUnique({ where: { id: v.id }, select: { validationNotes: true } })
    if (!row || !String(row.validationNotes ?? "").startsWith(MARK)) { skipped++; continue }
    await db.financialValue.delete({ where: { id: v.id } })
    values++
  }
  for (const r of data.reports ?? []) {
    const row = await db.financialReport.findUnique({ where: { id: r.id }, select: { sourceName: true, _count: { select: { values: true } } } })
    if (!row || row.sourceName !== "ASKBORA_PUBLIC" || row._count.values > 0) { skipped++; continue }
    await db.financialReport.delete({ where: { id: r.id } })
    reports++
  }
  console.log(`rollback complete: values=${values}, reports=${reports}, skipped=${skipped}`)
}

// ---------------------------------------------------------------- recompute
async function runRecompute() {
  const path = await import("node:path")
  const { createJiti } = await import("jiti")
  const root = path.resolve(process.cwd())
  const jiti = createJiti(path.join(root, "scripts", "askborsa-sync.mjs"), {
    interopDefault: true,
    moduleCache: false,
    alias: { "@": path.join(root, "src") },
  })
  const mod = await jiti.import(path.join(root, "src", "lib", "financial", "recompute.ts"))
  const { recomputeAll } = mod
  log("recompute: rebuilding derived metrics for all companies…")
  const results = await recomputeAll()
  let calc = 0
  let events = 0
  for (const r of results) { calc += r.calculatedMetrics ?? 0; events += (r.events ?? []).length }
  log(`recompute done: companies=${results.length}, calculatedMetrics=${calc}, events=${events}`)
}

// ---------------------------------------------------------------- main
async function main() {
  if (ROLLBACK_MODE) return runRollback()

  mkdirSync("reports", { recursive: true })

  let snapshot
  if (FROM_SNAPSHOT && existsSync(SNAPSHOT)) {
    snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8"))
    log(`loaded snapshot ${SNAPSHOT} (${snapshot.generatedAt})`)
  } else {
    const dbCompanies = await db.company.findMany({
      where: { isActive: true, ...(ONLY_TICKERS ? { ticker: { in: ONLY_TICKERS } } : {}) },
      select: { ticker: true },
      orderBy: { ticker: "asc" },
    })
    let tickers = dbCompanies.map((c) => c.ticker)
    if (LIMIT) tickers = tickers.slice(0, LIMIT)
    snapshot = await harvest(tickers)
    if (MERGE_PREV) {
      const prevPath = `${SNAPSHOT}.prev.json`
      if (existsSync(prevPath)) {
        const prev = JSON.parse(readFileSync(prevPath, "utf8"))
        const prevByTicker = new Map(prev.results.map((r) => [r.ticker, r]))
        let mergedPeriods = 0
        for (const res of snapshot.results) {
          const old = prevByTicker.get(res.ticker)
          if (!old) continue
          if (res.status !== "ok") { Object.assign(res, old); continue }
          // fresh pivot+statement data wins per key; the previous full snapshot
          // fills historical statement-page values this run did not fetch
          for (const [key, bucket] of Object.entries(old.periods ?? {})) {
            if (!res.periods[key]) { res.periods[key] = bucket; mergedPeriods++ }
          }
          for (const key of old.pivotCovered ?? []) if (!res.pivotCovered.includes(key)) res.pivotCovered.push(key)
        }
        log(`merged with ${prevPath} (generatedAt ${prev.generatedAt}): +${mergedPeriods} historical periods`)
        for (const res of snapshot.results) resolveCashIdentities(res)
      } else {
        log(`--merge-prev: no ${prevPath} found, skipping merge`)
      }
    }
    writeFileSync(SNAPSHOT, JSON.stringify(snapshot, null, 2), "utf8")
    log(`wrote ${SNAPSHOT}`)
  }

  const patterns = votePatterns(snapshot)
  const discreteCount = [...patterns.values()].filter((p) => p.pattern === "discrete").length
  const cumulativeCount = [...patterns.values()].filter((p) => p.pattern === "cumulative").length
  log(`flow patterns voted: ${patterns.size} (ticker|metric) pairs — discrete=${discreteCount}, cumulative=${cumulativeCount}`)

  const { plan, skipped, conflicts } = await buildPlan(snapshot, patterns, await inferFiscalStartByTicker(new Set(snapshot.results.map((x) => x.ticker))))
  const createReports = plan.filter((p) => p.action === "CREATE_REPORT")
  const addValues = plan.filter((p) => p.action === "ADD_VALUE")
  const totalValues = plan.reduce((n, p) => n + p.values.length, 0)
  const byTicker = {}
  for (const p of plan) byTicker[p.ticker] = (byTicker[p.ticker] ?? 0) + 1
  const skipReasons = {}
  for (const s of skipped) skipReasons[s.reason ?? "UNKNOWN"] = (skipReasons[s.reason ?? "UNKNOWN"] ?? 0) + 1

  log(`PLAN: ${createReports.length} reports to create, ${addValues.length} slot-fills, ${totalValues} values total, ${skipped.length} skips, ${conflicts.length} conflicts`)
  log(`top companies: ${Object.entries(byTicker).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t, n]) => `${t}(${n})`).join(", ")}`)
  log(`skip reasons: ${JSON.stringify(skipReasons)}`)

  writeFileSync(PLAN, JSON.stringify({ generatedAt: new Date().toISOString(), mode: APPLY ? "apply" : "dry-run", createReports: createReports.length, addValues: addValues.length, totalValues, plan, skipped }, null, 2), "utf8")
  log(`wrote ${PLAN}`)
  if (conflicts.length) {
    writeFileSync(CONFLICTS, JSON.stringify({ generatedAt: new Date().toISOString(), conflicts }, null, 2), "utf8")
    log(`wrote ${CONFLICTS} (${conflicts.length} conflicts for review — no data written for them)`)
  }

  if (!APPLY) {
    log("DRY RUN — rerun with --apply to write. Add --recompute to rebuild derived metrics after import.")
    return
  }

  const res = await applyPlan(plan)
  log(`APPLIED: reports=${res.reportCount}, values=${res.valueCount}; rollback saved to ${ROLLBACK}`)

  if (RECOMPUTE) await runRecompute()
  else log("next step: node scripts/run-recompute.cjs  (or rerun with --recompute)")
}

main()
  .catch((e) => { console.error("ASKBORA SYNC FAILED:", e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
