// Extraction Engine (server-only).
// Pipeline: document → detect kind → text extraction (see ./pdf) → line/label
// matching against the metric registry (EN + AR aliases) → candidate values →
// validation. DETERMINISTIC ONLY: every number must be printed in the document.
// NEVER invent values, NEVER infer a missing figure as zero. Ambiguous
// multi-column lines keep lower confidence and flow to the review workflow.

import { RAW_METRICS } from "./registry"
import { isUnit, type Unit } from "./units"
import { extractPdfTextZlib } from "./pdf"

export interface ExtractedCandidate {
  metricCode: string
  originalLabel: string
  value: number
  unit: Unit
  currency: string
  sourcePage?: number | null
  sourceText?: string | null
  confidence: number
}

export type DocumentKind = "PDF" | "CSV" | "TEXT" | "ZIP_OFFICE" | "UNKNOWN"

export function detectDocumentKind(buffer: Buffer): DocumentKind {
  if (buffer.length < 4) return "UNKNOWN"
  if (buffer.subarray(0, 5).toString("latin1").startsWith("%PDF-")) return "PDF"
  if (buffer.subarray(0, 2).toString("latin1") === "PK") return "ZIP_OFFICE" // xlsx/docx are zip containers
  // Heuristic: mostly printable UTF-8 → text/csv
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096)).toString("utf8")
  const printable = sample.replace(/[^\x20-\x7E\u0600-\u06FF\n\r\t,;:]/g, "")
  return printable.length / sample.length > 0.85 ? "TEXT" : "UNKNOWN"
}

// ---------------- Legacy whole-document PDF text (zlib engine) ----------------

export interface PdfTextResult {
  text: string
  pages: number
  looksScanned: boolean
}

/** Legacy synchronous PDF text extraction kept for older callers.
 *  Newer code should use parsePdf() from ./pdf (unpdf primary, this as fallback). */
export function extractPdfText(buffer: Buffer): PdfTextResult {
  const { pages } = extractPdfTextZlib(buffer)
  const text = pages.map((p) => p.text).join("\n")
  const alphanumeric = text.replace(/[^A-Za-z0-9\u0600-\u06FF]/g, "")
  return { text, pages: Math.max(pages.length, 1), looksScanned: alphanumeric.length < 40 }
}

// ---------------- Text normalization helpers ----------------

/** Smart punctuation produced by pdf.js text layers (WinAnsi 0x27/0x22 decode
 *  as U+2019/U+201C etc.) folded to their ASCII equivalents before matching. */
function normalizeSmartPunctuation(s: string): string {
  return s
    .replace(/[\u2018\u2019\u2032\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u00A0\u2007\u202F]/g, " ")
}

function normalizeLatin(s: string): string {
  return normalizeSmartPunctuation(s)
    .toLowerCase()
    .replace(/[():,.\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeArabic(s: string): string {
  return normalizeSmartPunctuation(s)
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "") // diacritics + tatweel
    .replace(/[\u0622\u0623\u0625]/g, "\u0627") // alef variants
    .replace(/\u0649/g, "\u064A") // alef maqsura → ya
    .replace(/\u0629/g, "\u0647") // ta marbuta → ha
    .replace(/[():,.\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits → ASCII 0-9 */
function toLatinDigits(s: string): string {
  return s
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
}

// ---------------- Number token normalization ----------------
// Handles: Arabic-Indic digits, Arabic thousands (٬ U+066C) / decimal (٫ U+066B)
// separators, parentheses-negative "(1,250)", trailing-minus "1,250-", leading
// minus, thousands commas (only when followed by exactly 3 digits) and the
// French-influenced "3,5" decimal style. Returns null when nothing parseable.

const NUMBER_RE = new RegExp(
  "(?:\\(\\s*|-(?=[0-9\\u0660-\\u0669\\u06F0-\\u06F9]))?" + // optional leading ( or attached minus
    "[0-9\\u0660-\\u0669\\u06F0-\\u06F9]" + // first digit (any script)
    "(?:[,\\u066C.\\u066B]*[0-9\\u0660-\\u0669\\u06F0-\\u06F9])*" + // separators + digits
    "(?:\\s*\\)|-(?![0-9\\u0660-\\u0669\\u06F0-\\u06F9]))?", // optional closing ) or attached trailing minus
  "g"
)

function resolveNumberSeparators(s: string): string | null {
  const hasComma = s.includes(",")
  const hasDot = s.includes(".")

  if (hasComma && hasDot) {
    // Rightmost separator is the decimal point, the other is thousands.
    const decSep = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : "."
    const thouSep = decSep === "," ? "." : ","
    const parts = s.split(decSep)
    if (parts.length !== 2) return null
    const [intSide, decSide] = parts
    if (!decSide || !/^\d+$/.test(decSide)) return null
    const groups = intSide.split(thouSep)
    if (groups.some((g, i) => i > 0 && g.length !== 3)) return null
    if (!groups.every((g) => /^\d*$/.test(g))) return null
    return `${groups.join("")}.${decSide}`
  }

  if (hasComma) {
    const groups = s.split(",")
    const last = groups[groups.length - 1]
    // "1,250,000" style: every comma followed by exactly 3 digits → thousands
    if (groups.every((g, i) => i === 0 || /^\d{3}$/.test(g)) && /^\d*$/.test(groups[0])) {
      return groups.join("")
    }
    // "3,5" style (single comma, 1-2 digits after) → decimal separator
    if (groups.length === 2 && /^\d{1,2}$/.test(last)) {
      return `${groups[0] || "0"}.${last}`
    }
    return null // ambiguous (e.g. "1,2500", Indian "1,25,000") — refuse to guess
  }

  if (hasDot) {
    const groups = s.split(".")
    if (groups.length === 2) {
      if (!groups.every((g) => /^\d*$/.test(g))) return null
      return s // single dot is always a decimal point ("2.5")
    }
    // multiple dots: accept only "1.250.000" European-thousands style
    if (groups.every((g, i) => i === 0 || /^\d{3}$/.test(g))) return groups.join("")
    return null
  }

  return /^\d+$/.test(s) ? s : null
}

/** Normalize a printed number token into a plain ASCII numeric string (or null). */
export function normalizeNumberToken(token: string): string | null {
  let s = (token ?? "").trim()
  if (!s) return null
  s = toLatinDigits(s)
  s = s.replace(/\u066C/g, ",").replace(/\u066B/g, ".")

  let negative = false
  const parenMatch = /^\(\s*(.*?)\s*\)$/.exec(s)
  if (parenMatch) {
    negative = true
    s = parenMatch[1]
  } else if (/^\(/.test(s)) {
    // unclosed leading paren (PDF text-layer artifact) — still means negative
    negative = true
    s = s.slice(1)
  }
  if (/^-/.test(s)) {
    negative = !negative
    s = s.slice(1).trim()
  }
  if (/-$/.test(s)) {
    negative = !negative
    s = s.slice(0, -1).trim()
  }

  s = s.replace(/\s+/g, "") // spaces inside numbers
  s = s.replace(/[^0-9.,]/g, "") // strip adjacent currency letters/symbols
  s = s.replace(/[.,]+$/, "") // dangling trailing separators
  if (!/\d/.test(s)) return null

  const resolved = resolveNumberSeparators(s)
  if (resolved === null) return null
  if (!/^\d*\.?\d*$/.test(resolved) || !/\d/.test(resolved)) return null
  const n = Number(resolved)
  if (!Number.isFinite(n)) return null
  return negative ? `-${resolved}` : resolved
}

/** Parse a printed number token into a JS number (or null when not parseable). */
export function parseNumberToken(token: string): number | null {
  const normalized = normalizeNumberToken(token)
  if (normalized === null) return null
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

// ---------------- Language detection ----------------

export type DetectedLanguage = "EN" | "AR" | "MIXED" | "UNKNOWN"

export function detectLanguage(text: string): DetectedLanguage {
  const arabic = (text.match(/[\u0600-\u06FF]/g) || []).length
  const latin = (text.match(/[A-Za-z]/g) || []).length
  const total = arabic + latin
  if (total < 20) return "UNKNOWN"
  if (arabic > latin * 2) return "AR"
  if (latin >= arabic * 2) return "EN"
  const arPct = arabic / total
  const enPct = latin / total
  if (arPct > 0.1 && enPct > 0.1) return "MIXED"
  return arabic > latin ? "AR" : "EN"
}

// ---------------- Statement type detection ----------------

export type DetectedStatementType = "CONSOLIDATED" | "STANDALONE" | "UNKNOWN"

function normalizeMarker(s: string): string {
  return normalizeArabic(s.toLowerCase())
}

const CONSOLIDATED_MARKERS = [
  "consolidated statement",
  "consolidated financial",
  "consolidated",
  "القوائم المالية الموحدة",
  "القوائم المالية المجمعة",
  "قائمة المركز المالي الموحدة",
  "الموحدة",
  "المجمعة",
].map(normalizeMarker)

const STANDALONE_MARKERS = [
  "separate financial statements",
  "standalone financial statements",
  "standalone",
  "القوائم المالية المنفصلة",
  "قوائم مالية منفصلة",
  "المنفصلة",
  "المستقلة",
].map(normalizeMarker)

/** CONSOLIDATED when only consolidated markers appear, STANDALONE when only
 *  separate/standalone markers appear, UNKNOWN when both/none (a PDF commonly
 *  contains both statement sets). */
export function detectStatementType(text: string): DetectedStatementType {
  const norm = ` ${normalizeArabic(text.toLowerCase()).replace(/unconsolidated/g, " ")} `
  const consolidated = CONSOLIDATED_MARKERS.some((m) => norm.includes(m))
  const standalone = STANDALONE_MARKERS.some((m) => norm.includes(m))
  if (consolidated && !standalone) return "CONSOLIDATED"
  if (standalone && !consolidated) return "STANDALONE"
  return "UNKNOWN"
}

// ---------------- Period detection ----------------

export type PeriodType = "QUARTERLY" | "SEMIANNUAL" | "NINE_MONTH" | "ANNUAL" | "OTHER"

export interface DetectedPeriod {
  periodType: PeriodType
  fiscalYear: number
  /** "Q1 2025" | "H1 2025" | "9M 2025" | "FY 2025" (falls back to the bare year) */
  periodLabel: string
  /** "Q2" | "H1" | "9M" | "" */
  sub: string
  periodStart: Date | null
  periodEnd: Date | null
  confidence: number
}

const MONTH_MAP: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sept: 9, sep: 9,
  oct: 10, nov: 11, dec: 12,
  يناير: 1, فبراير: 2, مارس: 3, ابريل: 4, مايو: 5, يونيو: 6, يوليو: 7,
  اغسطس: 8, سبتمبر: 9, اكتوبر: 10, نوفمبر: 11, ديسمبر: 12,
}

const MONTH_SRC = Object.keys(MONTH_MAP)
  .sort((a, b) => b.length - a.length)
  .join("|")
const MONTH_BOUND = `(?<![A-Za-z\\u0600-\\u06FF])(${MONTH_SRC})(?![A-Za-z\\u0640-\\u06FF])`

const DATE_DAY_MONTH_RE = new RegExp(`(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s*${MONTH_BOUND}(?:\\s*,?\\s*(\\d{4}))?`, "g")
const DATE_MONTH_DAY_RE = new RegExp(`${MONTH_BOUND}\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(\\d{4})`, "g")
const DATE_MONTH_YEAR_RE = new RegExp(`${MONTH_BOUND}\\s*(\\d{4})`, "g")
const DATE_NUMERIC_RE = /(\d{1,2})[./](\d{1,2})[./](\d{2,4})/g
const DATE_RANGE_RE = new RegExp(
  `(?:from|من)\\s+(\\d{1,2})\\s*${MONTH_BOUND}\\s*(?:(\\d{4})\\s*)?(?:to|الى|حتى)\\s+(\\d{1,2})\\s*${MONTH_BOUND}\\s*(\\d{4})`,
  "g"
)

// Duration keywords searched in a window before a full date (normalized text).
const DURATION_KEYWORDS: Array<{ type: PeriodType; re: RegExp }> = [
  { type: "NINE_MONTH", re: /nine\s+months|9\s*months|تسعه\s+اشهر|الاشهر\s+التسعه|9\s*اشهر/ },
  { type: "SEMIANNUAL", re: /six\s+months|6\s*months|سته\s+اشهر|الاشهر\s+سته|6\s*اشهر|نصف\s+(?:سنوي|السنه|العام)/ },
  { type: "QUARTERLY", re: /three\s+months|3\s*months|quarter|الربع|ثلاثه\s+اشهر|الاشهر\s+الثلاثه|3\s*اشهر/ },
  { type: "ANNUAL", re: /year\s+ended|years\s+ended|twelve\s+months|12\s*months|fiscal\s+year|annual|السنه|سنه|عام/ },
]

const AR_QUARTER_ORDINALS: Array<[string, string]> = [
  ["الاول", "Q1"], ["الثاني", "Q2"], ["الثالث", "Q3"], ["الرابع", "Q4"],
]

const QUARTER_EN_RE = /(?<![a-z0-9])q\s*([1-4])\s*,?\s*(\d{4})/g
const QUARTER_AR_RE = /الربع\s*(الاول|الثاني|الثالث|الرابع)(?:\s*(?:من\s*|عام\s*)?(\d{4}))?/g
const FY_RE = /(?<![a-z])fy\s*(\d{4})/g

/** Normalized text for period matching: keeps "." and "/" (numeric dates) while
 *  applying the Arabic diacritics/alef normalization and lowercasing. */
function normalizePeriodText(text: string): string {
  const guarded = toLatinDigits(text.toLowerCase())
    .replace(/\u066B/g, "\u0001")
    .replace(/\./g, "\u0001")
    .replace(/\//g, "\u0002")
  return normalizeArabic(guarded)
    .replace(/\u0001/g, ".")
    .replace(/\u0002/g, "/")
}

function firstMatch(re: RegExp, s: string): RegExpMatchArray | null {
  for (const m of s.matchAll(re)) return m
  return null
}

interface DateHit {
  day: number
  month: number
  year: number | null
  index: number
}

function collectDateHits(norm: string): DateHit[] {
  const hits: DateHit[] = []
  const seen = new Set<string>()
  const push = (day: number, month: number, year: number | null, index: number) => {
    if (day < 1 || day > 31 || month < 1 || month > 12) return
    if (year !== null && (year < 1900 || year > 2100)) return
    const key = `${day}-${month}-${year}`
    if (seen.has(key)) return
    seen.add(key)
    hits.push({ day, month, year, index })
  }
  for (const m of norm.matchAll(DATE_DAY_MONTH_RE)) {
    push(Number(m[1]), MONTH_MAP[m[2]] ?? 0, m[3] ? Number(m[3]) : null, m.index ?? 0)
  }
  for (const m of norm.matchAll(DATE_MONTH_DAY_RE)) {
    push(Number(m[2]), MONTH_MAP[m[1]] ?? 0, Number(m[3]), m.index ?? 0)
  }
  for (const m of norm.matchAll(DATE_NUMERIC_RE)) {
    let a = Number(m[1])
    let b = Number(m[2])
    let year = Number(m[3])
    if (year < 100) year += 2000
    if (b > 12 && a <= 12) {
      const t = a // US order "12/31/2024" → swap to day-first
      a = b
      b = t
    }
    push(a, b, year, m.index ?? 0)
  }
  hits.sort((x, y) => x.index - y.index)
  return hits
}

function matchDuration(windowText: string): PeriodType | null {
  for (const { type, re } of DURATION_KEYWORDS) {
    if (re.test(windowText)) return type
  }
  return null
}

function findQuarterOrdinal(windowText: string): string | null {
  for (const [word, sub] of AR_QUARTER_ORDINALS) {
    if (windowText.includes(word)) return sub
  }
  return null
}

function monthHeuristic(month: number): PeriodType {
  if (month === 3) return "QUARTERLY"
  if (month === 6) return "SEMIANNUAL"
  if (month === 9) return "NINE_MONTH"
  if (month === 12) return "ANNUAL"
  return "OTHER"
}

function subFor(periodType: PeriodType, endMonth: number, ordinal: string | null): string {
  switch (periodType) {
    case "QUARTERLY": {
      if (endMonth === 3) return "Q1"
      if (endMonth === 6) return "Q2"
      if (endMonth === 9) return "Q3"
      if (endMonth === 12) return "Q4"
      return ordinal ?? ""
    }
    case "SEMIANNUAL":
      return endMonth === 6 ? "H1" : endMonth === 12 ? "H2" : ""
    case "NINE_MONTH":
      return "9M"
    default:
      return ""
  }
}

function labelFor(periodType: PeriodType, sub: string, year: number): string {
  if (sub) return `${sub} ${year}`
  if (periodType === "ANNUAL") return `FY ${year}`
  return `${year}`
}

/** Calendar-aligned periods have a definitionally implied start date — only
 *  filled when the end month matches the sub-period's expected end month. */
function definitionalStart(periodType: PeriodType, sub: string, year: number, endMonth: number): Date | null {
  const expectedEnd: Record<string, number> = {
    Q1: 3, Q2: 6, Q3: 9, Q4: 12, H1: 6, H2: 12, "9M": 9,
    "": periodType === "ANNUAL" ? 12 : 0,
  }
  const expected = expectedEnd[sub] ?? 0
  if (!expected || endMonth !== expected) return null
  const startMonth = sub === "H2" ? 6 : sub === "Q2" ? 3 : sub === "Q3" ? 6 : sub === "Q4" ? 9 : 0
  return new Date(Date.UTC(year, startMonth, 1))
}

function buildFromEnd(hit: DateHit, duration: PeriodType | null, windowText: string, confidence: number): DetectedPeriod {
  const year = hit.year ?? new Date().getUTCFullYear()
  const periodEnd = new Date(Date.UTC(year, hit.month - 1, hit.day))
  const periodType = duration ?? monthHeuristic(hit.month)
  const ordinal = periodType === "QUARTERLY" ? findQuarterOrdinal(windowText) : null
  const sub = subFor(periodType, hit.month, ordinal)
  return {
    periodType,
    fiscalYear: year,
    periodLabel: labelFor(periodType, sub, year),
    sub,
    periodStart: definitionalStart(periodType, sub, year, hit.month),
    periodEnd,
    confidence,
  }
}

function buildRangeResult(start: Date, end: Date): DetectedPeriod {
  const days = Math.round((end.getTime() - start.getTime()) / 86400000)
  let periodType: PeriodType = "OTHER"
  if (days <= 110) periodType = "QUARTERLY"
  else if (days <= 200) periodType = "SEMIANNUAL"
  else if (days <= 300) periodType = "NINE_MONTH"
  else if (days >= 330 && days <= 400) periodType = "ANNUAL"
  const fiscalYear = end.getUTCFullYear()
  const sub = subFor(periodType, end.getUTCMonth() + 1, null)
  return {
    periodType,
    fiscalYear,
    periodLabel: labelFor(periodType, sub, fiscalYear),
    sub,
    periodStart: start,
    periodEnd: end,
    confidence: 0.9,
  }
}

/** Detect the reporting period from EN/AR date phrases.
 *  Priority: explicit range → dated phrase with duration keyword → bare full
 *  date → quarter keyword → FY keyword → lone month-year → null. */
export function detectPeriod(text: string): DetectedPeriod | null {
  const norm = normalizePeriodText(text || "")
  if (!norm) return null

  // 1) explicit range: "from 1 January 2025 to 31 March 2025" / "من 1 يناير الى 31 مارس 2025"
  const range = firstMatch(DATE_RANGE_RE, norm)
  if (range) {
    const startMonth = MONTH_MAP[range[2]]
    const endMonth = MONTH_MAP[range[5]]
    if (startMonth && endMonth) {
      const startYear = range[3] ? Number(range[3]) : Number(range[6])
      const start = new Date(Date.UTC(startYear, startMonth - 1, Number(range[1])))
      const end = new Date(Date.UTC(Number(range[6]), endMonth - 1, Number(range[4])))
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end >= start) {
        return buildRangeResult(start, end)
      }
    }
  }

  // 2) full dates — prefer ones preceded by a duration keyword ("three months ended ...")
  const hits = collectDateHits(norm)
  for (const hit of hits) {
    const windowText = norm.slice(Math.max(0, hit.index - 80), hit.index)
    const duration = matchDuration(windowText)
    if (!duration) continue
    return buildFromEnd(hit, duration, windowText, 0.9)
  }
  if (hits.length > 0) {
    const hit = hits[0]
    const windowText = norm.slice(Math.max(0, hit.index - 80), hit.index)
    return buildFromEnd(hit, null, windowText, 0.9)
  }

  // 3) quarter keyword: "Q2 2025" / "الربع الثاني 2025"
  const qEn = firstMatch(QUARTER_EN_RE, norm)
  if (qEn) {
    const year = Number(qEn[2])
    return {
      periodType: "QUARTERLY",
      fiscalYear: year,
      periodLabel: `Q${qEn[1]} ${year}`,
      sub: `Q${qEn[1]}`,
      periodStart: null,
      periodEnd: null,
      confidence: 0.6,
    }
  }
  const qAr = firstMatch(QUARTER_AR_RE, norm)
  if (qAr) {
    const sub = AR_QUARTER_ORDINALS.find(([word]) => word === qAr[1])?.[1] ?? ""
    const year = qAr[2] ? Number(qAr[2]) : new Date().getUTCFullYear()
    return {
      periodType: "QUARTERLY",
      fiscalYear: year,
      periodLabel: labelFor("QUARTERLY", sub, year),
      sub,
      periodStart: null,
      periodEnd: null,
      confidence: 0.6,
    }
  }

  // 4) fiscal-year keyword: "FY 2024"
  const fy = firstMatch(FY_RE, norm)
  if (fy) {
    const year = Number(fy[1])
    return {
      periodType: "ANNUAL",
      fiscalYear: year,
      periodLabel: `FY ${year}`,
      sub: "",
      periodStart: null,
      periodEnd: null,
      confidence: 0.6,
    }
  }

  // 5) lone month-year mention ("December 2024") — weakest signal
  for (const m of norm.matchAll(DATE_MONTH_YEAR_RE)) {
    const month = MONTH_MAP[m[1]]
    const year = Number(m[2])
    if (!month || year < 1900 || year > 2100) continue
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return buildFromEnd({ day: lastDay, month, year, index: m.index ?? 0 }, null, "", 0.6)
  }

  return null
}

// ---------------- Reporting-unit detection ----------------

/** Detect the reporting unit from document text ("in thousands", "بملايين", ...).
 *  Checked BILLION → MILLION → THOUSAND; defaults to UNIT. */
export function detectReportUnit(text: string): Unit {
  const lower = text.toLowerCase()
  const ar = normalizeArabic(lower) // normalizes آ→ا so بالآلاف/بآلاف both match
  if (/بالمليارات|مليارات الجنيهات|بالمليار/.test(ar) || /in billions? of|in billions/.test(lower)) return "BILLION"
  if (/بالملايين|بمليين|بالمليون|ملايين الجنيهات/.test(ar) || /in millions of|in millions/.test(lower)) return "MILLION"
  if (/بالالاف|الالاف الجنيهات|الاف الجنيهات/.test(ar) || /in thousands of|in thousands|'000|000's|000s of/.test(lower)) return "THOUSAND"
  return "UNIT"
}

// ---------------- Metric alias matching ----------------

interface AliasEntry {
  code: string
  norm: string
  isArabic: boolean
}

let aliasIndex: AliasEntry[] | null = null
function getAliasIndex(): AliasEntry[] {
  if (!aliasIndex) {
    aliasIndex = []
    for (const metric of RAW_METRICS) {
      const all = [metric.labelEn, metric.code, ...metric.aliases]
      for (const a of all) {
        const isArabic = /[\u0600-\u06FF]/.test(a)
        aliasIndex.push({ code: metric.code, norm: isArabic ? normalizeArabic(a) : normalizeLatin(a), isArabic })
      }
    }
    // longest first — prefer the most specific alias match
    aliasIndex.sort((a, b) => b.norm.length - a.norm.length)
  }
  return aliasIndex
}

function matchMetric(lineNorm: string, isArabicLine: boolean): { code: string; alias: string; index: number } | null {
  const index = getAliasIndex()
  for (const entry of index) {
    if (entry.isArabic !== isArabicLine) continue
    if (entry.norm.length < 3) continue
    const at = lineNorm.indexOf(entry.norm)
    if (at !== -1) return { code: entry.code, alias: entry.norm, index: at }
  }
  return null
}

// ---------------- Line-level value extraction ----------------

interface NumberTokenHit {
  value: number
  start: number
  end: number
}

const NUMERIC_DATE_SPAN_RE = /\d{1,2}[./]\d{1,2}[./]\d{2,4}/g
const MONTH_WORD_AFTER_RE =
  /^\s*[-–—]?\s*(?:jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sept?(ember)?|oct(ober)?|nov(ember)?|dec(ember)?|يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر)/i
const LETTER_RE = /\p{L}/u

// Lines whose matched label continues with a derived-figure word are margins/
// ratios/growth, not the raw metric — extracting them would poison the metric.
const DERIVED_AFTER_RE = /^\s*(?:margins?|percent(?:age)?|ratios?|rates?|growth|%)/
const DERIVED_BEFORE_AR_RE = /(?:هامش|نسبه)\s*$/

function isDerivedFigureLine(lineNorm: string, matchIndex: number, alias: string): boolean {
  if (DERIVED_AFTER_RE.test(lineNorm.slice(matchIndex + alias.length))) return true
  if (DERIVED_BEFORE_AR_RE.test(lineNorm.slice(0, matchIndex))) return true
  return false
}

function scanNumberTokens(line: string): NumberTokenHit[] {
  const hits: NumberTokenHit[] = []
  for (const m of line.matchAll(NUMBER_RE)) {
    const value = parseNumberToken(m[0])
    if (value !== null) hits.push({ value, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length })
  }
  return hits
}

function numericDateSpans(line: string): Array<[number, number]> {
  const spans: Array<[number, number]> = []
  for (const m of line.matchAll(NUMERIC_DATE_SPAN_RE)) {
    spans.push([m.index ?? 0, (m.index ?? 0) + m[0].length])
  }
  return spans
}

function isYearLike(v: number): boolean {
  return Number.isInteger(v) && v >= 1900 && v <= 2100
}

/** Deterministically pick the metric value from the numbers printed on a line.
 *  Structural numbers (column-header years, day-of-month before a month name,
 *  date fragments like 31/12/2024, leading row/note indexes) are filtered out
 *  — never inferred, only removed when clearly structural. The FIRST remaining
 *  number is the current-period column. */
function pickValue(
  tokens: NumberTokenHit[],
  line: string,
  dateSpans: Array<[number, number]>
): { value: number; count: number } | null {
  let pool = tokens.filter((t) => !dateSpans.some(([s, e]) => t.start >= s && t.end <= e))
  if (pool.length === 0) return null
  pool = pool.filter((t) => !MONTH_WORD_AFTER_RE.test(line.slice(t.end, t.end + 16)))
  if (pool.length === 0) return null
  const nonYear = pool.filter((t) => !isYearLike(t.value))
  if (nonYear.length > 0) pool = nonYear
  if (pool.length > 1) {
    // leading small integer before any letter = row/note index → drop it
    const firstLetterAt = line.search(LETTER_RE)
    const first = pool[0]
    if (
      firstLetterAt !== -1 &&
      first.start < firstLetterAt &&
      Number.isInteger(first.value) &&
      Math.abs(first.value) <= 99
    ) {
      pool = pool.slice(1)
    }
  }
  return { value: pool[0].value, count: pool.length }
}

function extractFromLine(line: string, sourcePage: number, reportUnit: Unit): ExtractedCandidate | null {
  const isArabicLine = /[\u0600-\u06FF]/.test(line)
  const lineNorm = isArabicLine ? normalizeArabic(line) : normalizeLatin(line)
  const metric = matchMetric(lineNorm, isArabicLine)
  if (!metric) return null
  if (isDerivedFigureLine(lineNorm, metric.index, metric.alias)) return null

  const tokens = scanNumberTokens(line)
  if (tokens.length === 0 || tokens.length > 8) return null // long number runs = percentage/junk tables

  const picked = pickValue(tokens, line, numericDateSpans(line))
  if (!picked) return null

  // per-line unit hint like "1,234 mn" / "12 bn"
  let unit: Unit = reportUnit
  if (/\b(?:mn|millions?)\b/i.test(line)) unit = "MILLION"
  else if (/\b(?:bn|billions?)\b/i.test(line)) unit = "BILLION"
  else if (/\b(?:thousands?|000s)\b/i.test(line)) unit = "THOUSAND"

  return {
    metricCode: metric.code,
    originalLabel: line.length > 160 ? line.slice(0, 160) : line,
    value: picked.value,
    unit,
    currency: "EGP",
    sourcePage,
    sourceText: line.length > 240 ? line.slice(0, 240) : line,
    confidence: picked.count === 1 ? 0.9 : 0.55, // 2+ numbers = comparative columns → review decides
  }
}

export interface ExtractFromPagesOptions {
  reportUnit?: Unit
}

/** Page-aware extraction: matches metric aliases per line, tracks sourcePage,
 *  and de-duplicates per metric ACROSS pages (comparative columns and repeated
 *  statements). First occurrence wins unless a later one has strictly higher
 *  confidence (single-number lines are unambiguous and preferred). */
export function extractFromPages(
  pages: ReadonlyArray<{ pageNumber: number; text: string }>,
  opts?: ExtractFromPagesOptions
): ExtractedCandidate[] {
  const allText = pages.map((p) => p.text || "").join("\n")
  const reportUnit = opts?.reportUnit ?? detectReportUnit(allText)
  const best = new Map<string, ExtractedCandidate>()

  for (const page of pages) {
    if (!page || !page.text) continue
    for (const rawLine of page.text.split(/\n+/)) {
      const line = rawLine.trim()
      if (!line) continue
      const candidate = extractFromLine(line, page.pageNumber, reportUnit)
      if (!candidate) continue
      const existing = best.get(candidate.metricCode)
      if (!existing || candidate.confidence > existing.confidence) best.set(candidate.metricCode, candidate)
    }
  }
  return Array.from(best.values())
}

/** Extract candidate financial values from raw text (single-page view). */
export function extractFromText(text: string, opts?: ExtractFromPagesOptions): ExtractedCandidate[] {
  return extractFromPages([{ pageNumber: 1, text: text || "" }], opts)
}

/** Extract from CSV text: rows of label,value[,unit]. Arabic digits/separators
 *  supported through normalizeNumberToken. */
export function extractFromCsv(text: string): ExtractedCandidate[] {
  const candidates: ExtractedCandidate[] = []
  const lines = text.split(/\r?\n/).filter(Boolean)
  for (const line of lines) {
    // skip header-ish lines
    if (/^\s*(?:label|metric|name|البند|البيان)\s*[,;]/i.test(line)) continue
    const parts = line.split(/\s*[,;]\s*/)
    if (parts.length < 2) continue
    const label = parts[0].trim()
    if (!label) continue
    const isArabicLine = /[\u0600-\u06FF]/.test(label)
    const lineNorm = isArabicLine ? normalizeArabic(label) : normalizeLatin(label)
    const metric = matchMetric(lineNorm, isArabicLine)
    if (!metric) continue

    // unquoted "1,250,000" CSV values split into pieces — rejoin when all pieces are numeric
    const rest = parts.slice(1)
    const valueToken =
      rest.length > 1 && rest.every((p) => /^[\d\s.,()+\-\u0660-\u0669\u066C\u066B]*$/.test(p))
        ? rest.join(",")
        : rest[0]
    const value = parseNumberToken(valueToken)
    if (value === null) continue

    const unitRaw = (parts[parts.length - 1] || "").trim().toUpperCase()
    const unit: Unit = isUnit(unitRaw) ? unitRaw : detectReportUnit(text)
    candidates.push({
      metricCode: metric.code,
      originalLabel: label,
      value,
      unit,
      currency: "EGP",
      sourcePage: null,
      sourceText: line,
      confidence: 1,
    })
  }
  return candidates
}
