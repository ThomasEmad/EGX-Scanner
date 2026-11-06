#!/usr/bin/env node
// TradingView → DB financial statements import (professional, full-coverage).
//
//   node scripts/tradingview-financials-import.mjs                       # PLAN (dry run, harvests all companies)
//   node scripts/tradingview-financials-import.mjs --from-snapshot      # plan from saved snapshot, no network
//   node scripts/tradingview-financials-import.mjs --apply              # harvest + WRITE (+ rollback + audit log)
//   node scripts/tradingview-financials-import.mjs --apply --recompute  # write + rebuild derived metrics
//   node scripts/tradingview-financials-import.mjs --rollback           # undo the last --apply
//   node scripts/tradingview-financials-import.mjs --tickers=ABUK,COMI  # restrict to tickers (smoke test)
//   node scripts/tradingview-financials-import.mjs --limit=10           # first N companies
//   node scripts/tradingview-financials-import.mjs --workers=6          # parallel browser contexts (default 5)
//
// Why TradingView: EGX fundamentals on TradingView carry the FULL exact-value
// history per company — income statement (~24 rows), balance sheet (6 rows),
// cash flow (4 rows) × 20 fiscal years + ~32 quarterly columns — and the latest
// published quarter (e.g. ABUK Q3 2026) which askborsa does not have. The
// public symbol pages render these tables client-side; the exact (unformatted)
// values live in the React fiber of each table row — no paywall bypass, no
// scraping of private APIs: it reads exactly what the public page displays.
//
// Import policy (conservative, mirrors the platform's established rules):
//   • only-missing-slot: existing values are NEVER overwritten; conflicts (>5%)
//     go to reports/tv-financials-conflicts.json for review.
//   • period identity = (periodType, periodLabel, CONSOLIDATED) AND the stored
//     periodEnd must match TradingView's within 45 days — fiscal-year changes
//     (e.g. ABUK Jun-end → Dec-end) make the same label a DIFFERENT period;
//     those are skipped + logged, never silently merged.
//   • expense rows arrive negative on TradingView and are flipped to the
//     platform's positive convention (COGS, INCOME_TAX, OPEX, provisions…).
//   • exact-zero values are skipped (they are placeholder noise, the purge job
//     exists to remove exactly that).
//   • discrete-quarter sum vs FY cross-check (≤8% / EGP 1m tolerance) — TradingView
//     quarters are discrete by construction; large mismatches mean a fiscal
//     transition artifact and those (metric, quarter) slots are skipped.
//   • quarterly label is derived from the period END month (calendar), not the
//     printed fiscal label — fiscal-year companies (ABUK "Q4 '18" ending
//     Jun 2018) land on the platform's calendar convention (Q2 2018).
//   • currency must be EGP (read from the page's own metadata).
//   • every write lands in reports/tv-financials-rollback.json + AuditLog.
//
// Output artifacts (reports/):
//   tv-financials-snapshot.json   raw harvest (crash-safe, incremental)
//   tv-financials-plan.json       the classified/validated import plan
//   tv-financials-rollback.json   undo journal for the last apply
//   tv-financials-conflicts.json  conflicts with existing DB values
//   tv-financials-errors.json     per-company harvest errors
import { chromium } from "playwright"
import { PrismaClient } from "@prisma/client"
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"

const db = new PrismaClient()

// ---------------------------------------------------------------- CLI ----
const APPLY = process.argv.includes("--apply")
const FROM_SNAPSHOT = process.argv.includes("--from-snapshot")
const ROLLBACK_MODE = process.argv.includes("--rollback")
const RECOMPUTE = process.argv.includes("--recompute")
const tickersArg = process.argv.find((a) => a.startsWith("--tickers="))
const ONLY_TICKERS = tickersArg ? tickersArg.split("=")[1].split(",").map((t) => t.trim().toUpperCase()).filter(Boolean) : null
const limitArg = process.argv.find((a) => a.startsWith("--limit="))
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : null
const workersArg = process.argv.find((a) => a.startsWith("--workers="))
const WORKERS = workersArg ? Math.max(1, Math.min(8, Number(workersArg.split("=")[1]))) : 5
const budgetArg = process.argv.find((a) => a.startsWith("--budget-min="))
const BUDGET_MS = budgetArg ? Number(budgetArg.split("=")[1]) * 60_000 : null
const delayArg = process.argv.find((a) => a.startsWith("--delay-ms="))
const DELAY_MS = delayArg ? Math.max(250, Number(delayArg.split("=")[1]) || 1600) : null
// polite pacing: TradingView rate-limits aggressive crawling with HTTP 403
// (transient — lifts after a cooldown). --delay-ms raises the per-page delay.
const PAGE_DELAY_OVERRIDE = DELAY_MS ?? null
const TV403_COOLDOWN_MS = 45_000
const TV403_BREAKER = 3
const HARVEST_ONLY = process.argv.includes("--harvest-only")

const SNAPSHOT = "reports/tv-financials-snapshot.json"
const PLAN = "reports/tv-financials-plan.json"
const ROLLBACK = "reports/tv-financials-rollback.json"
const CONFLICTS = "reports/tv-financials-conflicts.json"
const ERRORS = "reports/tv-financials-errors.json"
const AUDIT_MARK = "TV_FIN_IMPORT:"
const PARSER = "tv-financials-import@1"
const SOURCE = "TRADINGVIEW_FINANCIALS"
const METHOD = "TRADINGVIEW_HARVEST"
const CONFLICT_PCT = 5
const SUM_TOL_PCT = 8
const SUM_TOL_ABS = 1_000_000 // EGP 1m
const PERIOD_END_TOL_DAYS = 45
const PAGE_LOAD_TIMEOUT = 45_000
const SETTLE_MS = 900
const QUARTER_SETTLE_MS = 1_400
const PAGE_DELAY_MS = PAGE_DELAY_OVERRIDE ?? 1_600 // per-worker inter-page delay (politeness)
const JITTER_MS = 900

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

// ------------------------------------------------------- metric mapping ----
// TradingView row id (idWithoutPeriod) → platform metric code.
// flip: TV prints the row negative (expense) — platform stores costs positive.
const FLIP = true
const INCOME_ROWS = {
  total_revenue: { code: "REVENUE" },
  cost_of_goods: { code: "COGS", flip: FLIP },
  gross_profit: { code: "GROSS_PROFIT" },
  operating_expenses: { code: "OPERATING_EXPENSES_TOTAL", flip: FLIP },
  oper_income: { code: "OPERATING_INCOME" },
  total_non_oper_income: { code: "OTHER_INCOME" },
  pretax_income: { code: "PROFIT_BEFORE_TAX" },
  income_tax: { code: "INCOME_TAX", flip: FLIP },
  equity_in_earnings: { code: "INVESTMENT_INCOME" },
  net_income: { code: "NET_PROFIT" },
  earnings_per_share_basic: { code: "BASIC_EPS" },
  earnings_per_share_diluted: { code: "DILUTED_EPS" },
  basic_shares_outstanding: { code: "WEIGHTED_AVG_SHARES" },
  diluted_shares_outstanding: { code: "WEIGHTED_AVG_SHARES_DILUTED" },
  ebitda: { code: "EBITDA" },
  ebit: { code: "EBIT" },
  interest_expense: { code: "INTEREST_EXPENSE", flip: FLIP },
  minority_interest_exp: { code: "MINORITY_INTEREST", flip: FLIP },
  // bank statements
  interest_income_net: { code: "NET_INTEREST_INCOME" },
  non_interest_income: { code: "OTHER_INCOME" },
  loan_loss_provision: { code: "PROVISIONS", flip: FLIP },
  non_interest_expense: { code: "OPERATING_EXPENSES_TOTAL", flip: FLIP },
  unusual_expense_inc: { code: "EXTRAORDINARY_ITEMS", flip: FLIP },
}
// rows deliberately NOT imported (redundant / wrong statement kind / risky):
// net_revenue (banks — total_revenue is REVENUE, Yahoo-compatible),
// net_revenue_after_provision, income_from_cont_ops, net_income_bef_disc_oper,
// diluted_net_income, after_tax_other_income,
// discontinued_operations, dilution_adjustment, preferred_dividends,
// total_oper_expense (≡ COGS+OPEX).
const BALANCE_ROWS = {
  total_assets: { code: "TOTAL_ASSETS" },
  total_liabilities: { code: "TOTAL_LIABILITIES" },
  total_equity: { code: "TOTAL_EQUITY" },
  total_liabilities_shrhldrs_equity: { code: "TOTAL_EQUITY_AND_LIABILITIES" },
  total_debt: { code: "TOTAL_DEBT" },
  net_debt: { code: "NET_DEBT" },
  // bank regulatory capital + asset quality (12 EGX banks publish these on TV)
  common_equity_tier1: { code: "CET1_CAPITAL" },
  tier1_capital: { code: "TIER1_CAPITAL" },
  tier2_capital: { code: "TIER2_CAPITAL" },
  risk_weighted_assets: { code: "RISK_WEIGHTED_ASSETS" },
  nonperf_loans: { code: "NON_PERFORMING_LOANS" },
}
const CASH_ROWS = {
  cash_f_operating_activities: { code: "OPERATING_CASH_FLOW" },
  cash_f_investing_activities: { code: "INVESTING_CASH_FLOW" },
  cash_f_financing_activities: { code: "FINANCING_CASH_FLOW" },
  free_cash_flow: { code: "FREE_CASH_FLOW" },
  net_chg_in_cash: { code: "NET_CHANGE_IN_CASH" },
  cash_interest_paid: { code: "CASH_INTEREST_PAID", flip: FLIP },
  cash_taxes_paid: { code: "CASH_TAXES_PAID", flip: FLIP },
  foreign_exch_effects: { code: "FX_CASH_EFFECT" },
}
const AR_LABEL = {
  REVENUE: "إجمالي الإيرادات",
  COGS: "تكلفة الإيرادات",
  GROSS_PROFIT: "مجمل الربح",
  OPERATING_EXPENSES_TOTAL: "إجمالي المصروفات التشغيلية",
  OPERATING_INCOME: "الربح التشغيلي",
  OTHER_INCOME: "الإيرادات والمصروفات الأخرى",
  PROFIT_BEFORE_TAX: "الربح قبل الضريبة",
  INCOME_TAX: "مصروف ضريبة الدخل",
  INVESTMENT_INCOME: "أرباح الاستثمارات",
  NET_PROFIT: "صافي الربح",
  BASIC_EPS: "ربحية السهم الأساسية",
  DILUTED_EPS: "ربحية السهم المخففة",
  WEIGHTED_AVG_SHARES: "المتوسط المرجح لعدد الأسهم",
  WEIGHTED_AVG_SHARES_DILUTED: "المتوسط المرجح المخفف",
  EBITDA: "الأرباح قبل الفوائد والضرائب والإهلاك",
  EBIT: "الأرباح قبل الفوائد والضرائب",
  INTEREST_EXPENSE: "مصروف الفوائد",
  MINORITY_INTEREST: "حصة الأقلية",
  CET1_CAPITAL: "رأس المال الأساسي CET1",
  TIER1_CAPITAL: "رأس المال من المستوى الأول",
  TIER2_CAPITAL: "رأس المال من المستوى الثاني",
  RISK_WEIGHTED_ASSETS: "الأصول المرجحة بالمخاطر",
  NON_PERFORMING_LOANS: "القروض المتعثرة",
  NET_INTEREST_INCOME: "صافي دخل الفوائد",
  PROVISIONS: "المخصصات",
  EXTRAORDINARY_ITEMS: "بنود غير اعتيادية",
  TOTAL_ASSETS: "إجمالي الأصول",
  TOTAL_LIABILITIES: "إجمالي المطلوبات",
  TOTAL_EQUITY: "إجمالي حقوق المساهمين",
  TOTAL_EQUITY_AND_LIABILITIES: "إجمالي المطلوبات وحقوق الملكية",
  TOTAL_DEBT: "إجمالي الدين",
  NET_DEBT: "صافي الدين",
  OPERATING_CASH_FLOW: "التدفق النقدي التشغيلي",
  INVESTING_CASH_FLOW: "التدفق النقدي الاستثماري",
  FINANCING_CASH_FLOW: "التدفق النقدي التمويلي",
  FREE_CASH_FLOW: "التدفق النقدي الحر",
  NET_CHANGE_IN_CASH: "صافي التغير في النقدية",
  CASH_INTEREST_PAID: "الفوائد المدفوعة نقداً",
  CASH_TAXES_PAID: "الضرائب المدفوعة نقداً",
  FX_CASH_EFFECT: "أثر فروق العملة على النقدية",
}
const FLOW_METRICS = new Set([
  "REVENUE", "COGS", "GROSS_PROFIT", "OPERATING_EXPENSES_TOTAL", "OPERATING_INCOME", "OTHER_INCOME",
  "PROFIT_BEFORE_TAX", "INCOME_TAX", "INVESTMENT_INCOME", "NET_PROFIT", "EBITDA", "EBIT",
  "INTEREST_EXPENSE", "MINORITY_INTEREST",
  "NET_INTEREST_INCOME", "PROVISIONS", "EXTRAORDINARY_ITEMS",
  "OPERATING_CASH_FLOW", "INVESTING_CASH_FLOW", "FINANCING_CASH_FLOW", "FREE_CASH_FLOW",
  "NET_CHANGE_IN_CASH", "CASH_INTEREST_PAID", "CASH_TAXES_PAID", "FX_CASH_EFFECT",
])
// ratio/average metrics — summing them across quarters is meaningless (share
// counts double-count, EPS denominators shift), so the quarter-sum check skips them
const NO_SUM_CHECK = new Set(["WEIGHTED_AVG_SHARES", "WEIGHTED_AVG_SHARES_DILUTED", "BASIC_EPS", "DILUTED_EPS"])
function statementKind(code) {
  if (BALANCE_ROWS && Object.values(BALANCE_ROWS).some((m) => m.code === code)) return "BALANCE_SHEET"
  if (CASH_ROWS && Object.values(CASH_ROWS).some((m) => m.code === code)) return "CASH_FLOW"
  if (FLOW_METRICS.has(code) || code === "BASIC_EPS" || code === "DILUTED_EPS" || code.startsWith("WEIGHTED_AVG")) return "INCOME_STATEMENT"
  return "OTHER"
}
function prettyCode(code) {
  return code.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase())
}

// ------------------------------------------------------ period mapping ----
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
function parseMonthYear(s) {
  // "Jun 2006" | "Dec 2025" → Date at month end (UTC)
  const m = String(s || "").trim().match(/^([A-Za-z]{3})\s+(\d{4})$/)
  if (!m) return null
  const mi = MONTHS[m[1].toLowerCase()]
  if (mi === undefined) return null
  const y = Number(m[2])
  return new Date(Date.UTC(y, mi + 1, 0, 23, 59, 59))
}
function daysBetween(a, b) {
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000
}
// Classify one column of a statement view. Returns a period object or null.
// tvFiscalYear = the fiscal year TradingView labels the column with (Q4 '18 →
// FY2018 even when the quarter ends Jun-2018) — used for the quarter-sum
// checks; the platform report itself keeps the calendar year of periodEnd.
function classifyColumn(header, subheader) {
  const end = parseMonthYear(subheader)
  if (!end) return null
  const now = Date.now() + 5 * 86_400_000
  if (end.getTime() > now) return { skip: "FUTURE" }
  const h = String(header || "").trim()
  const year = end.getUTCFullYear()
  const month = end.getUTCMonth()
  // "H1 '25" / "H2 '25" — semiannual columns
  let m = h.match(/^H([12])\s*'(\d{2})$/)
  if (m) {
    const half = Number(m[1])
    return { periodType: "SEMIANNUAL", periodLabel: `H${half} ${year}`, fiscalYear: year, tvFiscalYear: 2000 + Number(m[2]), periodEnd: end, kind: half === 1 ? "H1" : "H2", months: 6 }
  }
  // "Q3 '26" — quarterly columns (fiscal labels; calendar mapping comes from the end month)
  m = h.match(/^Q([1-4])\s*'(\d{2})$/)
  if (m) {
    const q = month <= 2 ? 1 : month <= 5 ? 2 : month <= 8 ? 3 : 4
    return { periodType: "QUARTERLY", periodLabel: `Q${q} ${year}`, fiscalYear: year, tvFiscalYear: 2000 + Number(m[2]), periodEnd: end, kind: `Q${q}`, months: 3 }
  }
  // "H1 2025" / "H2 2025" unquoted variant
  m = h.match(/^H([12])\s+(\d{4})$/)
  if (m) {
    const half = Number(m[1])
    return { periodType: "SEMIANNUAL", periodLabel: `H${half} ${year}`, fiscalYear: year, tvFiscalYear: Number(m[2]), periodEnd: end, kind: half === 1 ? "H1" : "H2", months: 6 }
  }
  // plain year "2006" — annual column
  if (/^\d{4}$/.test(h)) {
    return { periodType: "ANNUAL", periodLabel: `FY ${h}`, fiscalYear: Number(h), tvFiscalYear: Number(h), periodEnd: end, kind: "FY", months: 12 }
  }
  return null
}
function classifyView(headers, subheaders) {
  const out = []
  const seen = new Map()
  let restated = 0
  for (let i = 0; i < headers.length; i++) {
    const p = classifyColumn(headers[i], subheaders[i])
    if (!p) { out.push(null); continue }
    if (p.skip) { out.push(null); continue }
    const key = `${p.periodType}|${p.periodLabel}`
    if (seen.has(key)) {
      // same label appearing twice: keep the later column (restatement), log it
      const prevIdx = seen.get(key)
      out[prevIdx] = null
      restated++
      seen.set(key, i)
      out.push(p)
      continue
    }
    seen.set(key, i)
    out.push(p)
  }
  return { periods: out, restated }
}

// ------------------------------------------------------------ harvest ----
// Runs inside the page. Walks the React fiber of every table row to recover
// the EXACT values (the DOM shows rounded "8.84 B"; the fiber holds the raw
// numbers the WebSocket payload delivered).
const EXTRACT_FN = `
(() => {
  const rows = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('[data-name]')) {
    let hit = null;
    for (const k of Object.keys(el)) {
      if (!k.startsWith('__reactFiber')) continue;
      let cur = el[k], d = 0;
      while (cur && d < 6) {
        const p = cur.memoizedProps;
        if (p && p.idWithoutPeriod && Array.isArray(p.values) && p.values.length > 0) { hit = p; break; }
        cur = cur.return; d++;
      }
      if (hit) break;
    }
    if (!hit || seen.has(hit.idWithoutPeriod)) continue;
    seen.add(hit.idWithoutPeriod);
    rows.push({ id: hit.idWithoutPeriod, title: el.getAttribute('data-name'), values: hit.values, additional: typeof hit.additionalValue === 'number' ? hit.additionalValue : null });
  }
  let headers = null, subheaders = null;
  // walk from every data-name element until one reaches the table component
  // (nav elements never do — the component is an ancestor of the ROWS)
  const els = document.querySelectorAll('[data-name]');
  outer: for (const el of els) {
    for (const k of Object.keys(el)) {
      if (!k.startsWith('__reactFiber')) continue;
      let cur = el[k], d = 0;
      while (cur && d < 45) {
        const p = cur.memoizedProps;
        if (p && Array.isArray(p.headerValues) && p.headerValues.length > 0 && Array.isArray(p.items)) {
          headers = p.headerValues.map((x) => String(x));
          subheaders = Array.isArray(p.headerSubvalues) ? p.headerSubvalues.map((x) => String(x)) : null;
          break outer;
        }
        cur = cur.return; d++;
      }
    }
  }
  // page metadata: symbol, currency, report frequency (from SSR init-data)
  let symbol = null, currency = null, frequency = null, fiscalQ = null, fiscalFY = null;
  for (const s of document.querySelectorAll('script[type="application/prs.init-data+json"]')) {
    try {
      const j = JSON.parse(s.textContent);
      for (const v of Object.values(j)) {
        if (v && typeof v === 'object') {
          if (typeof v.symbol === 'string' && !symbol) symbol = v.symbol;
          const q = v.initFinancialsQuotes;
          if (q) {
            currency = currency || (q.fundamental_currency_code || '').trim();
            frequency = frequency || q.last_report_frequency;
            fiscalQ = Array.isArray(q.fiscal_period_fq_h) ? q.fiscal_period_fq_h : null;
            fiscalFY = Array.isArray(q.fiscal_period_fy_h) ? q.fiscal_period_fy_h : null;
          }
        }
      }
    } catch {}
  }
  return { rows, headers, subheaders, symbol, currency, frequency, fiscalQ, fiscalFY, url: location.href };
})()
`

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }
function jitter(base) { return base + Math.floor(Math.random() * JITTER_MS) }

function statementUrl(tvSymbol, statement) {
  return `https://www.tradingview.com/symbols/${tvSymbol.replace(":", "-")}/financials-${statement}/`
}

// Light probe used by waitForFunction: counts fiber-backed table rows and
// whether the current column labels are quarterly-style. The financials table
// mounts asynchronously (data arrives over a WebSocket), so the page must be
// polled — a fixed sleep is not reliable.
const PROBE_FN = `
(() => {
  let n = 0, quarterly = false, headers = null;
  for (const el of document.querySelectorAll('[data-name]')) {
    for (const k of Object.keys(el)) {
      if (!k.startsWith('__reactFiber')) continue;
      let cur = el[k], d = 0;
      while (cur && d < 6) {
        const p = cur.memoizedProps;
        if (p && p.idWithoutPeriod && Array.isArray(p.values) && p.values.length > 0) { n++; break; }
        cur = cur.return; d++;
      }
    }
  }
  // the headerValues-holding component is an ancestor of the financial rows —
  // nav/[data-name] elements never reach it, so walk from EVERY data-name
  // element until one succeeds (the first table row wins)
  const els = document.querySelectorAll('[data-name]');
  outer: for (const el of els) {
    for (const k of Object.keys(el)) {
      if (!k.startsWith('__reactFiber')) continue;
      let cur = el[k], d = 0;
      while (cur && d < 45) {
        const p = cur.memoizedProps;
        if (p && Array.isArray(p.headerValues) && p.headerValues.length > 0 && Array.isArray(p.items)) {
          headers = p.headerValues.map(String);
          break outer;
        }
        cur = cur.return; d++;
      }
    }
  }
  if (headers) quarterly = headers.some((h) => /^Q[1-4]\\s*'/.test(h) || /^H[12]\\s*'/.test(h));
  return { n, quarterly };
})()
`

async function extractView(page, view) {
  if (view === "quarterly") {
    const btn = page.locator("button", { hasText: /^Quarterly$/ }).first()
    try {
      await btn.click({ timeout: 5_000 })
    } catch {
      return { error: "QUARTERLY_TOGGLE_MISSING" }
    }
  }
  // poll until the table the view needs is actually mounted
  const wantQuarterly = view === "quarterly"
  const deadline = Date.now() + 25_000
  let probe = { n: 0, quarterly: false }
  let lastProbeErr = null
  const t0v = Date.now()
  while (Date.now() < deadline) {
    probe = await page.evaluate(PROBE_FN).catch((e) => { lastProbeErr = e.message.slice(0, 100); return { n: 0, quarterly: false } })
    if (process.env.TV_DEBUG) log(`  [probe ${view}] t+${Date.now() - t0v}ms n=${probe.n} q=${probe.quarterly} err=${lastProbeErr ?? "-"}`)
    if (probe.n > 0 && (!wantQuarterly || probe.quarterly)) break
    if (view === "quarterly" && probe.n > 0 && !probe.quarterly) {
      // annual table still showing — the click may have raced the render; retry
      await page.locator("button", { hasText: /^Quarterly$/ }).first().click({ timeout: 3_000 }).catch(() => {})
    }
    await sleep(700)
  }
  if (probe.n === 0) return { error: `TABLE_NOT_FOUND${lastProbeErr ? " (probe: " + lastProbeErr + ")" : ""}` }
  if (wantQuarterly && !probe.quarterly) return { error: "QUARTERLY_TOGGLE_FAILED" }
  await sleep(500) // let value arrays settle after mount
  const raw = await page.evaluate(EXTRACT_FN).catch((e) => ({ error: "EVAL_FAILED:" + e.message.slice(0, 120) }))
  if (raw.error) return raw
  if (!raw.headers || raw.rows.length === 0) return { error: "TABLE_NOT_FOUND" }
  return raw
}

async function harvestStatement(browser, url, statement) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, locale: "en-US" })
  const page = await context.newPage()
  const out = { url, annual: null, quarterly: null }
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: PAGE_LOAD_TIMEOUT })
    if (res && (res.status() === 404 || res.status() === 410)) {
      out.notFound = true
      return out
    }
    if (res && res.status() >= 400) {
      out.error = `HTTP_${res.status()}`
      return out
    }
    await page.waitForSelector("[data-name]", { timeout: 20_000 }).catch(() => {})
    out.annual = await extractView(page, "annual")
    out.quarterly = await extractView(page, "quarterly")
  } catch (e) {
    out.error = e.message.slice(0, 200)
  } finally {
    await context.close().catch(() => {})
  }
  return out
}

async function searchSymbol(query) {
  // fallback mapping when EGX-{ticker} does not resolve: the public symbol
  // search indexes every EGX listing (name match, not a private endpoint)
  try {
    const res = await fetch(
      `https://symbol-search.tradingview.com/symbol_search/v3/?text=${encodeURIComponent(query)}&exchange=EGX&limit=20&lang=en`,
      { headers: { origin: "https://www.tradingview.com", "user-agent": "Mozilla/5.0" } },
    )
    if (!res.ok) return null
    const j = await res.json()
    return (j.symbols ?? []).map((s) => ({ symbol: s.symbol, description: s.description, full: s.full_name }))
  } catch {
    return null
  }
}

// ------------------------------------------------- harvest orchestration ----
const STATEMENTS = ["income-statement", "balance-sheet", "cash-flow"]

async function harvestCompany(browser, comp) {
  const t0 = Date.now()
  const result = {
    ticker: comp.ticker,
    nameEn: comp.nameEn,
    currency: null,
    frequency: null,
    tvSymbol: null,
    notFound: false,
    errors: [],
    statements: {},
    fetchedAt: new Date().toISOString(),
  }
  let hit403 = false
  for (const st of STATEMENTS) {
    let url = statementUrl(`EGX:${comp.ticker}`, st)
    let got = await harvestStatement(browser, url, st)
    if (got.error === "HTTP_403") {
      // edge rate-limit — cool down once and retry the same page
      hit403 = true
      log(`  ${comp.ticker} ${st}: HTTP 403 — cooling down ${TV403_COOLDOWN_MS / 1000}s …`)
      await sleep(TV403_COOLDOWN_MS)
      got = await harvestStatement(browser, url, st)
    }
    if (got.notFound) {
      // try the original ticker (pre-rename), then the public symbol search
      const candidates = []
      if (comp.originalTicker && comp.originalTicker.toUpperCase() !== comp.ticker) candidates.push(`EGX:${comp.originalTicker.toUpperCase()}`)
      const search = await searchSymbol(comp.ticker)
      if (search?.length) candidates.push(...search.map((s) => s.symbol))
      let resolved = null
      for (const sym of candidates) {
        const u = statementUrl(sym, st)
        const retry = await harvestStatement(browser, u, st)
        if (!retry.notFound && !retry.error && retry.annual?.rows?.length) { resolved = { sym, url: u, got: retry }; break }
      }
      if (!resolved) { result.notFound = true; result.errors.push(`${st}:NO_SYMBOL_ON_TV`); continue }
      url = resolved.url
      got = resolved.got
    } else if (got.error) {
      result.errors.push(`${st}:${got.error}`)
      continue
    }
    result.tvSymbol = result.tvSymbol || got.annual?.symbol || `EGX:${comp.ticker}`
    result.currency = result.currency || got.annual?.currency || null
    result.frequency = result.frequency || got.annual?.frequency || null
    result.statements[st] = { url, annual: got.annual, quarterly: got.quarterly }
    await sleep(jitter(PAGE_DELAY_MS))
  }
  result.ms = Date.now() - t0
  if (hit403 && Object.keys(result.statements).length === 0) result.rateLimited = true
  return result
}

async function runHarvest(companies) {
  const { chromium: _c } = await import("playwright")
  const browser = await _c.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
  mkdirSync("reports", { recursive: true })
  const snapshot = existsSync(SNAPSHOT) ? JSON.parse(readFileSync(SNAPSHOT, "utf8")) : { generatedAt: null, companies: {} }
  let done = 0
  const errs = []
  let consecutiveFailures = 0

  async function worker(queue) {
    while (queue.length) {
      if (BUDGET_MS && Date.now() - t0 > BUDGET_MS) { queue.length = 0; break } // time budget — resume on next run
      const comp = queue.shift()
      if (!comp) break
      let rec = null
      try {
        rec = await harvestCompany(browser, comp)
        consecutiveFailures = 0
      } catch (e) {
        rec = { ticker: comp.ticker, nameEn: comp.nameEn, error: "HARVEST_CRASH:" + e.message.slice(0, 160) }
        consecutiveFailures++
        if (consecutiveFailures >= 4) { log("circuit breaker: 4 consecutive crashes — aborting the run"); queue.length = 0 }
      }
      if (rec.error) errs.push({ ticker: rec.ticker, error: rec.error })
      else if (rec.errors?.length) errs.push({ ticker: rec.ticker, errors: rec.errors })
      snapshot.companies[rec.ticker] = rec
      snapshot.generatedAt = new Date().toISOString()
      done++
      // write after EVERY company — a killed/resumed run never loses work
      writeFileSync(SNAPSHOT, JSON.stringify(snapshot), "utf8")
      const ok = Object.values(snapshot.companies).filter((c) => Object.keys(c.statements ?? {}).length > 0).length
      log(`harvest ${done}/${companies.length} (usable: ${ok}, last: ${rec.ticker})`)
      // 403 circuit breaker: three consecutive fully-blocked companies mean the
      // edge has re-armed — abort cleanly (snapshot is saved) and cool off.
      if (rec.rateLimited) {
        consecutive403++
        if (consecutive403 >= TV403_BREAKER) {
          log(`circuit breaker: ${TV403_BREAKER} consecutive rate-limited companies — aborting run (resume later)`)
          queue.length = 0
          break
        }
      } else consecutive403 = 0
    }
  }

  const queue = [...companies]
  const t0 = Date.now()
  let consecutive403 = 0
  await Promise.all(Array.from({ length: WORKERS }, () => worker(queue)))
  writeFileSync(SNAPSHOT, JSON.stringify(snapshot), "utf8")
  writeFileSync(ERRORS, JSON.stringify({ generatedAt: new Date().toISOString(), errors: errs }, null, 2), "utf8")
  await browser.close()
  return { snapshot, errors: errs }
}

// ------------------------------------------------- normalize + validate ----
function normRowValue(raw, flip) {
  if (raw === null || raw === undefined || !Number.isFinite(Number(raw))) return null
  let v = Number(raw)
  if (!Number.isFinite(v)) return null
  if (flip) v = -v
  if (v === 0) return null // zero placeholders are noise — skip (see policy header)
  if (Math.abs(v) > 1e15) return null // scale-insane
  return v
}

// Build a flat {metricCode: value} matrix per (statement, view, columnIndex)
function matrixFromView(view) {
  if (!view || view.error || !view.headers) return null
  const { periods, restated } = classifyView(view.headers, view.subheaders ?? [])
  const cells = new Map() // colIdx → Map(code → value)
  let dropped = 0
  for (const row of view.rows ?? []) {
    const rowMap = INCOME_ROWS[row.id] ?? BALANCE_ROWS[row.id] ?? CASH_ROWS[row.id]
    if (!rowMap) continue
    if (!Array.isArray(row.values) || row.values.length !== view.headers.length) { dropped++; continue }
    for (let i = 0; i < row.values.length; i++) {
      if (!periods[i]) continue
      const v = normRowValue(row.values[i], rowMap.flip)
      if (v === null) continue
      if (!cells.has(i)) cells.set(i, new Map())
      const m = cells.get(i)
      if (m.has(rowMap.code)) {
        // same metric twice in one view (unexpected) — keep the larger-magnitude row
        const prev = m.get(rowMap.code)
        m.set(rowMap.code, Math.abs(v) > Math.abs(prev) ? v : prev)
      } else m.set(rowMap.code, v)
    }
  }
  return { periods, cells, restated, dropped }
}

// ------------------------------------------------------------- planning ----
async function loadExistingReports(companyIds) {
  const rows = await db.financialReport.findMany({
    where: { companyId: { in: companyIds }, deletedAt: null },
    select: { id: true, companyId: true, periodType: true, periodLabel: true, periodEnd: true, statementType: true, processingStatus: true },
  })
  const map = new Map()
  for (const r of rows) {
    const key = `${r.companyId}|${r.periodType}|${r.periodLabel}|CONSOLIDATED`
    // keep the "best" row per key: prefer non-failed statuses
    const rank = ["APPROVED", "VALIDATED", "EXTRACTED", "PROCESSING", "NEW_DOWNLOADED", "NEEDS_REVIEW"].indexOf(r.processingStatus)
    const prev = map.get(key)
    if (!prev || (rank >= 0 && rank < (prev._rank ?? 99))) { map.set(key, { ...r, _rank: rank >= 0 ? rank : 99 }) }
  }
  return map
}

async function planFromSnapshot(snapshot, companies) {
  const companyIds = companies.map((c) => c.id)
  const existingReports = await loadExistingReports(companyIds)
  const existingValues = new Map() // reportId → Set(metricCode)
  const valRows = await db.financialValue.findMany({
    where: { companyId: { in: companyIds }, isDemoData: false },
    select: { reportId: true, metricCode: true, value: true, normalizedValue: true, subPeriod: true, id: true },
  })
  for (const v of valRows) {
    if (v.subPeriod && v.subPeriod !== "CURRENT") continue
    if (!existingValues.has(v.reportId)) existingValues.set(v.reportId, new Map())
    existingValues.get(v.reportId).set(v.metricCode, v.normalizedValue ?? v.value)
  }

  const planEntries = []
  const conflicts = []
  const skipped = []
  const stats = { newReports: 0, fills: 0, conflicts: 0, skippedSlots: 0, companies: 0 }
  const sumChecks = [] // accumulated across all companies for the summary

  for (const comp of companies) {
    const rec = snapshot.companies[comp.ticker]
    if (!rec) { skipped.push({ ticker: comp.ticker, reason: "NO_SNAPSHOT" }); continue }
    if (rec.notFound) { skipped.push({ ticker: comp.ticker, reason: "NO_SYMBOL_ON_TV" }); continue }
    const usable = Object.keys(rec.statements ?? {}).length
    if (usable === 0) { skipped.push({ ticker: comp.ticker, reason: "HARVEST_FAILED", errors: rec.errors }); continue }
    if (rec.currency && rec.currency.toUpperCase() !== "EGP") { skipped.push({ ticker: comp.ticker, reason: `CURRENCY_${rec.currency.toUpperCase()}` }); continue }

    // company-level cross-check data: FY values per metric (from annual view) for sum-checks
    const perMetric = new Map() // metricCode → { annual: Map(fiscalYear→{value,end}), quarters: Map(label→{value,end,idx}) }
    const periodOwner = new Map() // "periodType|label" → { idx, end, statement, view, cells }

    for (const [st, view] of Object.entries(rec.statements)) {
      for (const viewName of ["annual", "quarterly"]) {
        const m = matrixFromView(view[viewName])
        if (!m) continue
        m.periods.forEach((p, i) => {
          if (!p) return
          const key = `${p.periodType}|${p.periodLabel}`
          const cells = m.cells.get(i)
          if (!cells || cells.size === 0) return
          const prev = periodOwner.get(key)
          if (prev && daysBetween(prev.end, p.periodEnd) <= PERIOD_END_TOL_DAYS) {
            // same period already captured from another statement/view — merge metrics
            const target = prev.cells
            for (const [code, v] of cells) if (!target.has(code)) target.set(code, v)
            return
          }
          if (prev) {
            // same label but different periodEnd (fiscal-year change) — the later
            // statement in iteration order wins is ambiguous; prefer the one with
            // more metrics, log the ambiguity
            if (cells.size > prev.cells.size) periodOwner.set(key, { end: p.periodEnd, statement: st, view: viewName, cells, period: p, ambiguity: true })
            else prev.ambiguity = true
            return
          }
          periodOwner.set(key, { end: p.periodEnd, statement: st, view: viewName, cells, period: p })
        })
      }
    }

    // fill perMetric for validation
    for (const [key, slot] of periodOwner.entries()) {
      for (const [code, v] of slot.cells) {
        if (!perMetric.has(code)) perMetric.set(code, { annual: new Map(), quarters: new Map() })
        const pm = perMetric.get(code)
        if (slot.period.periodType === "ANNUAL") pm.annual.set(slot.period.fiscalYear, { value: v, end: slot.period.periodEnd, label: slot.period.periodLabel, tvFiscalYear: slot.period.tvFiscalYear })
        else if (slot.period.periodType === "QUARTERLY") pm.quarters.set(key, { value: v, end: slot.period.periodEnd, label: slot.period.periodLabel, tvFiscalYear: slot.period.tvFiscalYear })
      }
    }

    // sum-check: per metric, per TV fiscal year, Σ fiscal quarters vs FY.
    // TradingView quarterly labels carry the fiscal year (Q4 '18 = FY2018 for
    // a Jun-ending filer), so grouping by that year is exact — no date
    // windows, which would pull a 5th quarter for mid-year filers.
    const suspectSlots = new Set() // "periodType|label|code"
    const sumDetail = new Map() // suspect slot → {sum, fyValue, quarters}
    for (const [code, pm] of perMetric) {
      if (NO_SUM_CHECK.has(code)) continue // averages/ratios — summing is meaningless
      if (!FLOW_METRICS.has(code)) continue // stock (balance-sheet) metrics are point-in-time — never summed
      for (const [fy, fySlot] of pm.annual) {
        const qs = [...pm.quarters.entries()].filter(([, q]) => q.tvFiscalYear === fySlot.tvFiscalYear)
        if (qs.length < 3) continue // need most of the year for a meaningful check
        const sum = qs.reduce((a, [, q]) => a + q.value, 0)
        const tol = Math.max(Math.abs(fySlot.value) * SUM_TOL_PCT / 100, SUM_TOL_ABS)
        const ok = Math.abs(sum - fySlot.value) <= tol
        sumChecks.push({ code, fy, ok, sum, fyValue: fySlot.value, quarters: qs.length })
        if (!ok) for (const [k] of qs) { suspectSlots.add(`${k}|${code}`); sumDetail.set(`${k}|${code}`, { sum, fyValue: fySlot.value, quarters: qs.length }) }
      }
    }

    // build plan entries per period
    for (const [key, slot] of periodOwner.entries()) {
      const { period } = slot
      const repKey = `${comp.id}|${period.periodType}|${period.periodLabel}|CONSOLIDATED`
      const existing = existingReports.get(repKey)
      const writes = []
      for (const [code, v] of slot.cells) {
        const suspect = suspectSlots.has(`${key}|${code}`)
        const kind = statementKind(code)
        if (kind === "OTHER" && !AR_LABEL[code]) { stats.skippedSlots++; continue }
        if (existing) {
          const slotVals = existingValues.get(existing.id)
          const prev = slotVals?.get(code)
          if (prev !== undefined) {
            const pct = Math.abs(v - prev) / Math.max(Math.abs(prev), 1) * 100
            if (pct > CONFLICT_PCT) { conflicts.push({ ticker: comp.ticker, period: period.periodLabel, metric: code, existing: prev, tv: v, diffPct: +pct.toFixed(1) }); stats.conflicts++ }
            continue // only-missing: never overwrite
          }
        }
        writes.push({ code, value: v, suspect, sumCheck: suspect ? sumDetail.get(`${key}|${code}`) : null })
      }
      if (writes.length === 0) continue
      // periodEnd guard on existing reports
      if (existing && existing.periodEnd && daysBetween(new Date(existing.periodEnd), period.periodEnd) > PERIOD_END_TOL_DAYS) {
        conflicts.push({
          ticker: comp.ticker, period: period.periodLabel, metric: "PERIOD",
          existing: new Date(existing.periodEnd).toISOString().slice(0, 10), tv: period.periodEnd.toISOString().slice(0, 10),
          diffPct: null, note: "PERIOD_END_MISMATCH (fiscal-year change) — skipped",
        })
        stats.conflicts++
        continue
      }
      planEntries.push({
        ticker: comp.ticker,
        companyId: comp.id,
        reportId: existing?.id ?? null,
        periodType: period.periodType,
        periodLabel: period.periodLabel,
        fiscalYear: period.fiscalYear,
        periodStart: new Date(period.periodEnd.getTime() - period.months * 30.44 * 86_400_000).toISOString().slice(0, 10),
        periodEnd: period.periodEnd.toISOString().slice(0, 10),
        statement: slot.statement,
        sourceUrl: rec.statements[slot.statement]?.url ?? null,
        tvSymbol: rec.tvSymbol,
        ambiguity: slot.ambiguity ?? false,
        values: writes.map((w) => ({ metric: w.code, value: w.value, kind: statementKind(w.code), label: AR_LABEL[w.code] ?? prettyCode(w.code), suspect: w.suspect, sumCheck: w.sumCheck })),
      })
      if (!existing) stats.newReports++
      stats.fills += writes.length
    }
    stats.companies++
  }
  return { entries: planEntries, conflicts, skipped, stats, sumChecks: sumChecksSample(sumChecks) }
}
function sumChecksSample(checks) {
  const bad = checks.filter((c) => !c.ok)
  return { total: checks.length, failed: bad.length, samples: bad.slice(0, 40) }
}

// ---------------------------------------------------------------- apply ----
const STATUS_RANK = { APPROVED: 0, VALIDATED: 1, EXTRACTED: 2, PROCESSING: 3, NEW_DOWNLOADED: 4, NEEDS_REVIEW: 5, FAILED: 8, REJECTED: 9, DELETED: 10 }

async function applyPlan(entries) {
  mkdirSync("reports", { recursive: true })
  const rollback = { generatedAt: new Date().toISOString(), source: SOURCE, parser: PARSER, reports: [], values: [] }
  const blocked = []
  let reportCount = 0
  let valueCount = 0

  // group by report slot: entries may target the same existing report from
  // different statements (income/balance/cash) — merge their values
  const bySlot = new Map()
  for (const e of entries) {
    const key = `${e.companyId}|${e.periodType}|${e.periodLabel}|CONSOLIDATED`
    if (!bySlot.has(key)) bySlot.set(key, { ...e, values: [...e.values] })
    else {
      const t = bySlot.get(key)
      const have = new Set(t.values.map((v) => v.metric))
      for (const v of e.values) if (!have.has(v.metric)) { t.values.push(v); have.add(v.metric) }
    }
  }

  for (const entry of bySlot.values()) {
    let reportId = entry.reportId
    if (!reportId) {
      // soft-deleted / superseded / FAILED rows still occupy the key — never
      // resurrect a deliberately removed report (platform rule)
      const dup = await db.financialReport.findFirst({
        where: { companyId: entry.companyId, periodType: entry.periodType, periodLabel: entry.periodLabel, statementType: "CONSOLIDATED" },
        select: { id: true, deletedAt: true, processingStatus: true },
      })
      if (dup && (dup.deletedAt || (STATUS_RANK[dup.processingStatus] ?? 9) >= 8)) {
        blocked.push({ ticker: entry.ticker, periodLabel: entry.periodLabel, reason: dup.deletedAt ? "SOFT_DELETED" : dup.processingStatus })
        continue
      }
      if (dup) {
        reportId = dup.id
      } else {
        const created = await db.financialReport.create({
          data: {
            companyId: entry.companyId,
            reportType: entry.periodType === "ANNUAL" ? "ANNUAL" : "INTERIM",
            periodType: entry.periodType,
            statementType: "CONSOLIDATED",
            fiscalYear: entry.fiscalYear,
            periodLabel: entry.periodLabel,
            periodStart: new Date(entry.periodStart),
            periodEnd: new Date(entry.periodEnd),
            language: "EN",
            sourceName: SOURCE,
            sourceUrl: entry.sourceUrl,
            processingStatus: "EXTRACTED",
            extractionMethod: METHOD,
            parserVersion: PARSER,
            extractionConfidence: 0.85,
            isDemoData: false,
            version: 1,
            notes: `TradingView financial statements import (${entry.tvSymbol}); exact printed values via public symbol page.`,
          },
          select: { id: true },
        })
        reportId = created.id
        rollback.reports.push({ id: reportId, ticker: entry.ticker, periodLabel: entry.periodLabel })
        reportCount++
      }
    }
    // values: only-missing-slot with an in-memory pre-check + P2002 backstop
    const existing = await db.financialValue.findMany({
      where: { reportId },
      select: { metricCode: true, subPeriod: true },
    })
    const have = new Set(existing.filter((v) => !v.subPeriod || v.subPeriod === "CURRENT").map((v) => v.metricCode))
    for (const v of entry.values) {
      if (have.has(v.metric)) continue
      const validationStatus = v.suspect ? "NEEDS_REVIEW" : "VALID"
      const confidence = v.suspect ? 0.7 : 0.85
      const notes = [
        `${AUDIT_MARK} TradingView ${entry.tvSymbol} (${entry.statement}); source ${entry.sourceUrl}`,
        ...(v.suspect && v.sumCheck ? [`sum-check FAILED vs FY: Σ ${v.sumCheck.quarters} quarters = ${v.sumCheck.sum} vs FY ${v.sumCheck.fyValue} — flagged for review`] : []),
      ].join(" | ")
      try {
        const row = await db.financialValue.create({
          data: {
            companyId: entry.companyId,
            reportId,
            metricCode: v.metric,
            // originalLabel is user-visible (Arabic hint on the statements
            // table) — provenance lives in validationNotes (product rule).
            originalLabel: AR_LABEL[v.metric] ?? v.label ?? prettyCode(v.metric),
            value: v.value,
            currency: "EGP",
            unit: "UNIT",
            normalizedValue: v.value,
            statementType: v.kind || statementKind(v.metric),
            subPeriod: "CURRENT",
            extractionMethod: METHOD,
            confidence,
            validationStatus,
            validationNotes: notes,
            sourceText: entry.sourceUrl,
            isDemoData: false,
          },
          select: { id: true },
        })
        rollback.values.push({ id: row.id, ticker: entry.ticker, metric: v.metric, value: v.value })
        valueCount++
      } catch (e) {
        if (String(e?.code) === "P2002") { blocked.push({ ticker: entry.ticker, periodLabel: entry.periodLabel, metric: v.metric, reason: "VALUE_UNIQUE" }); continue }
        throw e
      }
    }
  }
  writeFileSync(ROLLBACK, JSON.stringify(rollback), "utf8")
  if (blocked.length) {
    writeFileSync("reports/tv-financials-blocked.json", JSON.stringify({ generatedAt: new Date().toISOString(), blocked }, null, 2), "utf8")
    log(`blocked (soft-deleted/failed/unique): ${blocked.length} → reports/tv-financials-blocked.json`)
  }
  await db.auditLog.create({
    data: {
      actor: "system",
      action: "UPLOAD",
      entityType: "FinancialReport",
      details: `${AUDIT_MARK} ${reportCount} reports created, ${valueCount} values added (parser ${PARSER}); rollback ${ROLLBACK}`,
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
    if (!row || !String(row.validationNotes ?? "").includes(AUDIT_MARK)) { skipped++; continue }
    await db.financialValue.delete({ where: { id: v.id } })
    values++
  }
  for (const r of data.reports ?? []) {
    const rep = await db.financialReport.findUnique({ where: { id: r.id }, select: { notes: true, _count: { select: { values: true } } } })
    if (!rep || !String(rep.notes ?? "").includes("TradingView financial statements import")) { skipped++; continue }
    if (rep._count.values > 0) { skipped++; continue } // only empty reports; values were removed above
    await db.financialReport.delete({ where: { id: r.id } })
    reports++
  }
  await db.auditLog.create({
    data: {
      actor: "system",
      action: "DELETE",
      entityType: "FinancialReport",
      details: `${AUDIT_MARK} rollback: ${values} values removed, ${reports} reports deleted, ${skipped} skipped`,
    },
  })
  log(`rollback done: ${values} values, ${reports} reports, ${skipped} skipped`)
}

async function recomputeAll() {
  const PORT = process.env.PORT || "3000"
  const SECRET = process.env.CRON_SECRET
  if (!SECRET) { log("recompute skipped: CRON_SECRET not set"); return }
  log("triggering full metric recompute …")
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/v1/cron/recompute`, { headers: { authorization: `Bearer ${SECRET}` } })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !body.ok) { log(`recompute failed: HTTP ${res.status}`); return }
    const t = body.totals ?? {}
    log(`recompute done: ${t.companies ?? "?"} companies, ${t.calculatedMetrics ?? "?"} metrics, ${t.events ?? "?"} events`)
  } catch (e) {
    log(`recompute request failed: ${e.message}`)
  }
}

// ------------------------------------------------------------- printing ----
function printPlanSummary(plan) {
  const s = plan.stats
  log("── plan summary ────────────────────────────────────────────")
  log(`companies planned:      ${s.companies}`)
  log(`new reports:            ${s.newReports}`)
  log(`values to write:        ${s.fills}`)
  log(`conflicts (>5% diff):   ${s.conflicts}`)
  log(`skipped slots:          ${s.skippedSlots}`)
  log(`skipped companies:      ${plan.skipped.filter((x) => !x.metric).length}`)
  log(`sum-checks:             ${plan.sumChecks.total} (${plan.sumChecks.failed} failed)`)
  const byType = {}
  for (const e of plan.entries) byType[e.periodType] = (byType[e.periodType] ?? 0) + 1
  log(`entries by period type: ${JSON.stringify(byType)}`)
  const sample = plan.entries.filter((e) => e.ticker === "ABUK").slice(0, 6)
  for (const e of sample) log(`  ABUK ${e.periodLabel.padEnd(9)} → ${e.values.length} values (${e.reportId ? "fill" : "NEW"})`)
}

// ----------------------------------------------------------------- main ----
async function main() {
  if (ROLLBACK_MODE) { await runRollback(); await db.$disconnect(); return }

  const companies = await db.company.findMany({
    where: { isActive: true, isDemoData: false },
    select: { id: true, ticker: true, nameEn: true, originalTicker: true },
    orderBy: { ticker: "asc" },
  })
  const target = ONLY_TICKERS ? companies.filter((c) => ONLY_TICKERS.includes(c.ticker.toUpperCase())) : companies.slice(0, LIMIT ?? companies.length)
  log(`target companies: ${target.length} (apply=${APPLY}, fromSnapshot=${FROM_SNAPSHOT}, workers=${WORKERS})`)

  let snapshot
  if (FROM_SNAPSHOT) {
    snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8"))
    log(`using saved snapshot (${Object.keys(snapshot.companies).length} companies, generated ${snapshot.generatedAt})`)
  } else {
    // resume: a company is done when it has usable statements, or is known
    // absent from TradingView, or failed only with terminal errors. Anything
    // else (page errors, toggle failures) is retried on the next run.
    const prev = existsSync(SNAPSHOT) ? JSON.parse(readFileSync(SNAPSHOT, "utf8")) : { companies: {} }
    const isUsable = (rec) =>
      rec &&
      (rec.notFound ||
        (Object.keys(rec.statements ?? {}).length > 0 &&
          (rec.errors ?? []).every((e) => e.includes("NO_SYMBOL_ON_TV"))))
    const todo = target.filter((c) => !isUsable(prev.companies?.[c.ticker]))
    if (todo.length < target.length) log(`resume: ${target.length - todo.length} already harvested, ${todo.length} to (re)harvest`)
    const res = await runHarvest(todo)
    snapshot = res.snapshot
    const failed = res.errors.length
    const usable = Object.values(snapshot.companies).filter(isUsable).length
    log(`harvest finished: ${usable}/${target.length} usable, ${failed} with errors → ${ERRORS}`)
  }

  if (HARVEST_ONLY) {
    log("harvest-only mode — no plan, no writes.")
    await db.$disconnect()
    return
  }

  const plan = await planFromSnapshot(snapshot, target)
  writeFileSync(PLAN, JSON.stringify({ generatedAt: new Date().toISOString(), apply: APPLY, ...plan }, null, 2), "utf8")
  if (plan.conflicts.length) writeFileSync(CONFLICTS, JSON.stringify({ generatedAt: new Date().toISOString(), conflicts: plan.conflicts }, null, 2), "utf8")
  printPlanSummary(plan)

  if (!APPLY) {
    log("dry run only — nothing written. Re-run with --apply to write.")
  } else {
    const t0 = Date.now()
    const res = await applyPlan(plan.entries)
    log(`apply done in ${((Date.now() - t0) / 1000).toFixed(0)}s: ${res.reportCount} reports created, ${res.valueCount} values written`)
    if (RECOMPUTE) await recomputeAll()
  }
  await db.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await db.$disconnect()
  process.exit(1)
})
