// Pure AskBorsa public-page helpers used by the harvest/recovery pipeline.
//
// Everything here is deterministic and has no database or network access so it
// can be unit-tested. Values are taken exactly as published by AskBorsa
// (public EGX company pages only — no authentication, paywall, or access
// control bypass).
//
// The public pivot JSON contains only 10 metrics (no revenue/COGS). Quarterly
// Q2/Q3 values are frequently cumulative or misaligned, so quarterly flow
// values are usable only when Q1+Q2+Q3+Q4 sums to FY within tolerance and none
// of Q1-Q3 equals FY.

// Canonical statement kind per metric, mirroring MetricDefinition.statementType.
// FinancialValue.statementType must be the statement kind (not the
// consolidation basis) so the financials API can group rows.
export const STATEMENT_KIND: Record<string, string> = {
  NET_PROFIT: "INCOME_STATEMENT",
  NET_PROFIT_PARENT: "INCOME_STATEMENT",
  GROSS_PROFIT: "INCOME_STATEMENT",
  REVENUE: "INCOME_STATEMENT",
  COGS: "INCOME_STATEMENT",
  OPERATING_INCOME: "INCOME_STATEMENT",
  NET_INTEREST_INCOME: "INCOME_STATEMENT",
  EPS: "INCOME_STATEMENT",
  PROFIT_BEFORE_TAX: "INCOME_STATEMENT",
  INCOME_TAX: "INCOME_STATEMENT",
  FINANCE_COST: "INCOME_STATEMENT",
  TOTAL_ASSETS: "BALANCE_SHEET",
  TOTAL_LIABILITIES: "BALANCE_SHEET",
  TOTAL_EQUITY_AND_LIABILITIES: "BALANCE_SHEET",
  TOTAL_EQUITY: "BALANCE_SHEET",
  EQUITY_PARENT: "BALANCE_SHEET",
  NON_CONTROLLING_INTERESTS: "BALANCE_SHEET",
  CURRENT_ASSETS: "BALANCE_SHEET",
  NON_CURRENT_ASSETS: "BALANCE_SHEET",
  CURRENT_LIABILITIES: "BALANCE_SHEET",
  NON_CURRENT_LIABILITIES: "BALANCE_SHEET",
  CASH_AND_EQUIVALENTS: "BALANCE_SHEET",
  OPERATING_CASH_FLOW: "CASH_FLOW",
  INVESTING_CASH_FLOW: "CASH_FLOW",
  FINANCING_CASH_FLOW: "CASH_FLOW",
  NET_CHANGE_IN_CASH: "CASH_FLOW",
  DIVIDENDS_PAID: "CASH_FLOW",
}

export function statementKind(metric: string): string {
  return STATEMENT_KIND[metric] ?? "OTHER"
}

export const AR_MONTHS: Record<string, number> = {
  يناير: 1,
  فبراير: 2,
  مارس: 3,
  أبريل: 4,
  مايو: 5,
  يونيو: 6,
  يوليو: 7,
  أغسطس: 8,
  سبتمبر: 9,
  أكتوبر: 10,
  نوفمبر: 11,
  ديسمبر: 12,
}

export const ITEM_TO_METRIC: Record<string, string> = {
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

export const FLOW_METRICS = new Set([
  "NET_PROFIT",
  "GROSS_PROFIT",
  "OPERATING_CASH_FLOW",
  "INVESTING_CASH_FLOW",
  "FINANCING_CASH_FLOW",
  "NET_CHANGE_IN_CASH",
])
export const STOCK_METRICS = new Set([
  "TOTAL_ASSETS",
  "TOTAL_LIABILITIES",
  "TOTAL_EQUITY",
  "TOTAL_EQUITY_AND_LIABILITIES",
])

export type PivotRow = { item: string; label: string; section?: string; values: Record<string, number | null> }
export type Pivot = { period: string; label: string; years: number[]; rows: PivotRow[] }

function unescapeNextFlight(html: string): string {
  // Next.js flight payload escapes quotes and backslashes inside JS strings.
  return html.replace(/\\"/g, '"').replace(/\\\\/g, "\\")
}

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
}

/**
 * Locate the first pivot array on an AskBorsa page and parse it.
 *
 * The old extractor searched for `[{"period":"FY"}` and silently missed pages
 * whose first pivot is Q1/Q2/Q3/Q4. This accepts any period order and returns
 * the pivots in document order.
 */
export function extractPivots(html: string): Pivot[] | null {
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
    return pivots.filter(
      (p) => p && typeof p.period === "string" && Array.isArray(p.rows) && typeof p.years === "object",
    ) as Pivot[]
  } catch {
    return null
  }
}

export function extractMetadata(html: string) {
  const text = visibleText(html)
  const currency =
    /العملة\s+(EGP|USD)/.exec(text)?.[1] ??
    (/\bUSD\b|بالدولار/.test(text) ? "USD" : /\bEGP\b|العملة\s+جنيه/.test(text) ? "EGP" : null)
  const fiscalMonthAr = /السنة المالية تبدأ في\s+([^\s·]+)/.exec(text)?.[1] ?? null
  const fiscalYearStartMonth = fiscalMonthAr ? (AR_MONTHS[fiscalMonthAr] ?? null) : null
  const sectorSlug = /\/sector\/([a-z-]+)/.exec(html)?.[1] ?? null
  const nameAr = /<h1[^>]*>([^<]+)<\/h1>/.exec(html)?.[1]?.trim() ?? null
  const latestPeriod =
    /آخر قوائم:\s*([^·]+?)(?:\s+النتائج القادمة|$)/.exec(text)?.[1]?.trim() ?? null
  const noStatements =
    /No summarised financial statements are available|لا توجد قوائم مالية ملخصة|لا تتوفر قوائم مالية ملخصة/.test(text)

  return { currency, fiscalYearStartMonth, fiscalMonthAr, sectorSlug, nameAr, latestPeriod, noStatements }
}

export function englishName(title: string, ticker: string): string | null {
  const cleaned = title.replace(/\s*\|\s*AskBorsa\s*$/, "").trim()
  const m = new RegExp(`^(.*?)\\s*\\(${ticker}\\)`, "i").exec(cleaned)
  if (m && m[1].trim() && !/[\u0600-\u06FF]/.test(m[1])) return m[1].trim()
  return null
}

/**
 * Fiscal dates. AskBorsa labels a fiscal year by the calendar year in which it
 * ends (verified against MPCI/AXPH/EAST: July-start FY2024 ends 30 June 2024).
 */
export function fiscalDates(fiscalYear: number, startMonth: number) {
  const startYear = startMonth === 1 ? fiscalYear : fiscalYear - 1
  const start = new Date(Date.UTC(startYear, startMonth - 1, 1))
  const endMonthIndex = (startMonth - 2 + 12) % 12
  const end = new Date(Date.UTC(fiscalYear, endMonthIndex + 1, 0))
  return { start, end }
}

export function isFuturePeriodEnd(date: Date): boolean {
  return date.getTime() > Date.now() + 86_400_000
}

function tolerance(base: number): number {
  return Math.max(Math.abs(base) * 0.02, 2_000_000)
}

/** Median of absolute values. */
export function medianAbs(values: number[]): number | null {
  const a = values.filter((v) => Number.isFinite(v) && v !== 0).map(Math.abs)
  if (a.length === 0) return null
  a.sort((x, y) => x - y)
  const mid = Math.floor(a.length / 2)
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2
}

/**
 * Scale guard: a value is suspicious when it is more than `maxRatio` away from
 * the company's own local median for the same metric (requires >= 2 anchors).
 * Balance-sheet metrics use maxRatio 10; flow metrics use 100.
 */
export function scaleGuard(value: number, anchors: number[], metric: string): { ok: boolean; ratio: number | null } {
  const med = medianAbs(anchors)
  if (med === null || anchors.length < 2) return { ok: true, ratio: null }
  const maxRatio = STOCK_METRICS.has(metric) ? 10 : 100
  const ratio = Math.abs(value) / med
  return { ok: ratio <= maxRatio && ratio >= 1 / maxRatio, ratio }
}

/**
 * Sum-to-FY gate for quarterly flow metrics.
 *   - none of Q1..Q3 may equal FY (annual-copy signature)
 *   - Q1+Q2+Q3+Q4 must equal FY within 5% or EGP 1m
 */
export function sumToFyGate(quarters: number[], fy: number): { ok: boolean; sum: number; gap: number } {
  const sum = quarters.reduce((a, b) => a + b, 0)
  const gap = sum - fy
  const ok = Math.abs(gap) <= Math.max(Math.abs(fy) * 0.05, 1_000_000)
  return { ok, sum, gap }
}

export function normalizeName(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/&amp;/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(
      (w) => w.length > 2 && !["the", "for", "and", "co", "company", "sae", "eg", "holding", "group"].includes(w),
    )
    .join(" ")
}

export function nameTokens(s: string): Set<string> {
  return new Set(normalizeName(s).split(" ").filter(Boolean))
}

export function jaccard(a: string, b: string): number {
  const A = nameTokens(a)
  const B = nameTokens(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  return inter / (A.size + B.size - inter)
}

/** ISO 6166 check digit. */
export function isIsinValid(isin: string): boolean {
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return false
  const digits = isin
    .slice(0, -1)
    .split("")
    .map((ch) => (ch >= "A" ? ch.charCodeAt(0) - 55 : +ch))
    .join("")
  let total = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = +digits[i]
    if (double) {
      n *= 2
      total += Math.floor(n / 10) + (n % 10)
    } else {
      total += n
    }
    double = !double
  }
  return (10 - (total % 10)) % 10 === +isin[isin.length - 1]
}
