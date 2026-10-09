// Context-aware financial statement extraction engine.
//
// Replaces the keyword/metric matcher with a multi-layer understanding system:
//   1. Document classification — identify which pages are primary statements vs notes
//   2. Table structure analysis — detect headers, column periods, row hierarchy
//   3. Note-number rejection — reject "8 . Earnings per share" where 8 is a note number
//   4. Multi-candidate scoring — when a metric appears multiple times, pick the best by context
//   5. Multi-factor confidence — label match + table match + column match + period match + validation
//
// KEY PRINCIPLE: A smaller dataset of verified values is better than a large dataset
// containing silently incorrect values.

import { RAW_METRICS, type RawMetricDef, getMetricGroup } from "../registry"
import { METRIC_CODE_TO_GROUP } from "../expanded-metrics"
import type {
  ExtractionCell,
  ExtractionLine,
  ExtractionPage,
  ExtractionResult,
  ExtractionRow,
  ExtractionTable,
} from "./index-types"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface MatchedCandidate {
  metricCode: string
  originalLabel: string
  value: number
  unit: string
  currency: string
  sourcePage: number
  sourceTable: number | null
  sourceRow: number | null
  sourceCol: number | null
  sourceBbox: { x0: number; y0: number; x1: number; y1: number } | null
  extractionMethod: "PDF_TEXT" | "PDF_TABLE" | "OCR" | "MANUAL_ENTRY"
  confidence: number
  group?: string
  subPeriod?: string
  isRestated?: boolean
  displayOrder?: number
  // New context fields
  statementSection?: StatementSection
  valueType?: "REPORTED" | "CALCULATED" | "DERIVED"
  rejectionReason?: string
}

export type StatementSection =
  | "PRIMARY_INCOME_STATEMENT"
  | "PRIMARY_BALANCE_SHEET"
  | "PRIMARY_CASH_FLOW"
  | "PRIMARY_EQUITY_CHANGES"
  | "NOTE"
  | "SUMMARY"
  | "HIGHLIGHTS"
  | "OTHER"

export interface ColumnPeriodInfo {
  colIndex: number
  periodLabel: string | null
  isCurrent: boolean
  isComparative: boolean
  isRestated: boolean
  isNotes: boolean
}

// ---------------------------------------------------------------------------
// Alias index (length-descending for longest-match-first)
// ---------------------------------------------------------------------------
interface AliasIndexEntry {
  code: string
  alias: string
  normalized: string
  language: "EN" | "AR"
  raw: RawMetricDef
}

function normalizeLatin(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019\u2032\u02bc\u201c\u201d]/g, (c) =>
      c === "\u201c" || c === "\u201d" ? '"' : "'",
    )
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/[(),.\-–—/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeArabic(s: string): string {
  return s
    .replace(/[\u064b-\u0652\u0670\u0640]/g, "")
    .replace(/[\u0622\u0623\u0625]/g, "\u0627")
    .replace(/\u0649/g, "\u064a")
    .replace(/\u0629/g, "\u0647")
    .replace(/[(),.\-–—/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function isArabic(s: string): boolean {
  return /[\u0600-\u06ff]/.test(s)
}

const ALIAS_INDEX: AliasIndexEntry[] = (() => {
  const entries: AliasIndexEntry[] = []
  for (const m of RAW_METRICS) {
    for (const alias of m.aliases) {
      const language: "EN" | "AR" = isArabic(alias) ? "AR" : "EN"
      const normalized = isArabic(alias) ? normalizeArabic(alias) : normalizeLatin(alias)
      if (!normalized || normalized.length < 3) continue
      entries.push({ code: m.code, alias, normalized, language, raw: m })
    }
  }
  entries.sort((a, b) => b.normalized.length - a.normalized.length)
  return entries
})()

// ---------------------------------------------------------------------------
// CRITICAL: Note-number / section-number / page-number detection
// ---------------------------------------------------------------------------
// This is the #1 cause of extraction errors. Patterns like:
//   "8 . Earnings per share"  → 8 is a NOTE NUMBER, not EPS
//   "3.2. Financial investments" → 3.2 is a SECTION NUMBER
//   "13 . Loans and advances" → 13 is a NOTE NUMBER
//   "Level 1 - Quoted prices" → 1 is a HIERARCHY LEVEL

/**
 * Detect if a label text starts with a note/section/page number pattern.
 * Returns the cleaned label (without the number) if detected, or null if no number prefix.
 *
 * Patterns detected:
 *   "8 . Earnings per share"      → note number 8
 *   "8. Earnings per share"       → note number 8
 *   "3.2. Financial investments"   → section number 3.2
 *   "27 . Adjustments to..."      → note number 27
 *   "Level 1 - Quoted prices"     → level number 1 (not a metric at all)
 *   "(3)" or "(12)"               → note reference in parentheses
 */
function stripLeadingNumber(
  text: string,
): { cleaned: string; noteNumber: number | null; isSectionNumber: boolean } {
  let cleaned = text.trim()
  let noteNumber: number | null = null
  let isSectionNumber = false

  // Pattern: "N . text" or "N. text" (note number at start)
  // e.g. "8 . Earnings per share" or "27 . Adjustments"
  const noteMatch = cleaned.match(/^(\d{1,3})\s*\.\s+/)
  if (noteMatch) {
    noteNumber = parseInt(noteMatch[1])
    cleaned = cleaned.slice(noteMatch[0].length)
    return { cleaned, noteNumber, isSectionNumber }
  }

  // Pattern: "N.N. text" or "N.N.N. text" (section number)
  // Also handles "N.N . text" (section number with space before dot)
  // e.g. "3.2. Financial investments" or "14.1 . Profits"
  const sectionMatch = cleaned.match(/^(\d{1,2}(?:\.\d{1,2}){1,3})\s*\.\s+/)
  if (sectionMatch) {
    isSectionNumber = true
    const firstNum = parseInt(sectionMatch[1].split(".")[0])
    noteNumber = firstNum
    cleaned = cleaned.slice(sectionMatch[0].length)
    return { cleaned, noteNumber, isSectionNumber }
  }

  // Pattern: "(N)" at end of label (note reference in parentheses)
  // Also handles "(N-M)" (range) and "(N" (truncated, no closing paren)
  // e.g. "Accumulated depreciation (3)" or "Total Loans (1" or "Ending net assets (2-4)"
  const parenRefMatch = cleaned.match(/\((\d{1,3})(?:\s*[-–—]\s*\d{1,3})?\)?\s*$/)
  if (parenRefMatch) {
    noteNumber = parseInt(parenRefMatch[1])
    cleaned = cleaned.slice(0, parenRefMatch.index).trim()
    return { cleaned, noteNumber, isSectionNumber: false }
  }

  // Pattern: "Level N" at start (fair value hierarchy)
  // e.g. "Level 1 - Quoted prices"
  const levelMatch = cleaned.match(/^Level\s+(\d+)\s*[-–—]/i)
  if (levelMatch) {
    noteNumber = parseInt(levelMatch[1])
    cleaned = cleaned.slice(levelMatch[0].length)
    return { cleaned, noteNumber, isSectionNumber: false }
  }

  return { cleaned, noteNumber: null, isSectionNumber: false }
}

/**
 * Check if a numeric value is suspiciously small (likely a note/section/page number).
 * Financial statement values are typically in thousands or millions — a value of
 * 1-50 is almost certainly a note number, page number, or section reference.
 */
function isLikelyNoteOrPageNumber(value: number, label: string): boolean {
  // CRITICAL: Reject year-like numbers (1900-2100) — these are years, not values
  if (Number.isInteger(value) && value >= 1900 && value <= 2100) {
    return true
  }

  // CRITICAL: Reject day-like numbers (1-31) when the label contains date patterns
  // e.g. "Total assets as at 31 March 2024" → 31 is the day, not the assets value
  if (Number.isInteger(value) && value >= 1 && value <= 31) {
    const lower = label.toLowerCase()
    // Check for date patterns
    const hasDatePattern = lower.includes("as at") || lower.includes("for the") ||
      lower.includes("march") || lower.includes("june") || lower.includes("september") ||
      lower.includes("december") || lower.includes("january") || lower.includes("april") ||
      lower.includes("july") || lower.includes("october") || lower.includes("february") ||
      lower.includes("may") || lower.includes("august") || lower.includes("november") ||
      /\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(lower)
    if (hasDatePattern) {
      return true // Day number from a date
    }
  }

  // If the value is a small integer (1-99) and the label contains note-number patterns
  if (Number.isInteger(value) && value >= 1 && value <= 99) {
    const trimmed = label.trim()
    // Check if label starts with a number followed by "."
    if (/^\d{1,3}\s*\./.test(trimmed)) return true
    // Check if label has "(N)" at end (full note reference)
    if (/\(\d{1,3}\)\s*$/.test(trimmed)) return true
    // Check if label has "(N" at end (truncated note ref without closing paren)
    if (/\(\d{1,3}$/.test(trimmed)) return true
    // Check if label has "(N-M)" or "(N-M" at end (range reference)
    if (/\(\d{1,3}\s*[-–—]\s*\d{1,3}\)?\s*$/.test(trimmed)) return true
    // BROADER CHECK: any parenthesized number anywhere near the end of the label
    if (/\(\d{1,3}\)?\s*\w{0,5}$/.test(trimmed) && value <= 30) return true
    // Check if label is a "Level N" pattern
    if (/^Level\s+\d/i.test(trimmed)) return true
    // Check if label contains "Note" + the number
    if (new RegExp(`\\bNote\\s+${value}\\b`, "i").test(label)) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Statement section classification
// ---------------------------------------------------------------------------
/**
 * Classify a page/table as a primary financial statement or a note.
 * Uses text patterns to detect which statement type a page contains.
 */
function classifyPageSection(page: ExtractionPage): StatementSection {
  const text = ((page.text as string) || "").toLowerCase()
  const linesText = page.lines.map((l) => l.text.toLowerCase()).join(" ")

  // Combine all text for classification
  const allText = text + " " + linesText

  // Primary statement detection — check for key structural indicators
  // Balance Sheet: has Assets, Liabilities, AND Equity sections
  const hasAssets = allText.includes("total assets") || allText.includes("assets")
  const hasLiabilities = allText.includes("total liabilities") || allText.includes("liabilities")
  const hasEquity = allText.includes("total equity") || allText.includes("shareholders") || allText.includes("rights of owners")
  // Only classify as primary balance sheet if it has the structural pattern
  // Don't require "balance sheet" in title — many EGX PDFs don't use that exact phrase
  if (hasAssets && (hasLiabilities || hasEquity)) {
    // Check it's not just a note about assets — require at least 2 of the 3
    const balanceSheetSignals = [hasAssets, hasLiabilities, hasEquity].filter(Boolean).length
    if (balanceSheetSignals >= 2) {
      return "PRIMARY_BALANCE_SHEET"
    }
  }

  // Income Statement: has Revenue AND Net Profit/Income
  const hasRevenue = allText.includes("revenue") || allText.includes("interest income") || allText.includes("net interest income")
  const hasProfit = allText.includes("net profit") || allText.includes("net income") || allText.includes("profit for the period") || allText.includes("profit for the year")
  const hasPBT = allText.includes("profit before tax") || allText.includes("income before tax")
  const hasEPS = allText.includes("earnings per share") || allText.includes("eps")
  if (hasRevenue && (hasProfit || hasPBT || hasEPS)) {
    return "PRIMARY_INCOME_STATEMENT"
  }

  // Cash Flow Statement
  if (
    allText.includes("operating activities") || allText.includes("cash flow from operating") ||
    allText.includes("investing activities") || allText.includes("financing activities") ||
    allText.includes("التدفقات النقدية")
  ) {
    return "PRIMARY_CASH_FLOW"
  }

  // Statement of Changes in Equity
  if (
    allText.includes("changes in equity") || allText.includes("statement of changes") ||
    allText.includes("تغيرات حقوق الملكية")
  ) {
    return "PRIMARY_EQUITY_CHANGES"
  }

  // Note detection — ONLY if the page doesn't look like a primary statement
  // "Notes" appearing as a column header is NOT the same as a notes page
  // Check for note-specific patterns: "Note 1", "Note N", "1. Basis of presentation"
  const hasNoteNumbers = /\bnote\s+\d{1,2}\b/i.test(allText) || /^\d{1,2}\s*\.\s+(basis|accounting|summary|significant)/im.test(allText)
  if (hasNoteNumbers) {
    return "NOTE"
  }

  return "OTHER"
}

/**
 * Classify a table based on its row content.
 */
function classifyTableSection(table: ExtractionTable, pageSection: StatementSection): StatementSection {
  // If the page is a primary statement, the table likely is too
  if (
    pageSection === "PRIMARY_INCOME_STATEMENT" ||
    pageSection === "PRIMARY_BALANCE_SHEET" ||
    pageSection === "PRIMARY_CASH_FLOW" ||
    pageSection === "PRIMARY_EQUITY_CHANGES"
  ) {
    return pageSection
  }

  // Check table content for statement keywords
  const allText = table.rows
    .map((r) => r.cells.map((c) => c.raw_text || "").join(" "))
    .join(" ")
    .toLowerCase()

  if (allText.includes("total assets") || allText.includes("total liabilities") || allText.includes("total equity")) {
    // Check if this looks like a primary statement (has multiple financial metrics)
    const financialMetrics = ["assets", "liabilities", "equity", "revenue", "profit", "cash"]
    const matchCount = financialMetrics.filter((m) => allText.includes(m)).length
    if (matchCount >= 3) return "PRIMARY_BALANCE_SHEET"
  }
  if (allText.includes("revenue") && (allText.includes("net profit") || allText.includes("gross profit"))) {
    return "PRIMARY_INCOME_STATEMENT"
  }
  if (allText.includes("operating activities") && allText.includes("investing activities")) {
    return "PRIMARY_CASH_FLOW"
  }

  // Check for note number patterns in labels
  const noteLabels = table.rows.filter((r) => {
    const label = r.cells.find((c) => c.is_label)?.raw_text || ""
    return /^\d{1,3}\s*\./.test(label.trim())
  })
  if (noteLabels.length > 0) {
    return "NOTE"
  }

  return pageSection
}

// ---------------------------------------------------------------------------
// Column period detection
// ---------------------------------------------------------------------------
/**
 * Analyze table column headers to determine which column is the current period
 * vs comparative period vs notes column.
 */
function detectColumnPeriods(table: ExtractionTable): ColumnPeriodInfo[] {
  const colCount = table.column_count
  const result: ColumnPeriodInfo[] = []

  // Get header text from first row (or first row that looks like a header)
  const headerRow = table.rows[0]
  if (!headerRow) {
    for (let i = 0; i < colCount; i++) {
      result.push({
        colIndex: i,
        periodLabel: null,
        isCurrent: i === 0, // assume first col is current
        isComparative: i > 0,
        isRestated: false,
        isNotes: false,
      })
    }
    return result
  }

  // Extract header cell texts
  const headerTexts = headerRow.cells.map((c) => c.raw_text || "")

  // Look for year patterns in header cells
  const yearCols: { col: number; year: number; label: string }[] = []
  for (let i = 0; i < headerTexts.length; i++) {
    const h = headerTexts[i]
    const yearMatch = h.match(/(20\d{2})/)
    if (yearMatch) {
      yearCols.push({ col: i, year: parseInt(yearMatch[1]), label: h })
    }
    // Check if this is a "notes" column
    const lower = h.toLowerCase()
    if (lower.includes("note") || lower.includes("ايضاح") || lower.includes("ملاحظة")) {
      // Will be marked as notes below
    }
  }

  // Sort by year descending — latest year is current period
  yearCols.sort((a, b) => b.year - a.year)

  for (let i = 0; i < colCount; i++) {
    const headerText = headerTexts[i] || ""
    const lower = headerText.toLowerCase()
    const yearMatch = headerText.match(/(20\d{2})/)
    const isRestated = lower.includes("restated") || lower.includes("معاد")

    let isCurrent = false
    let isComparative = false
    let isNotes = lower.includes("note") || lower.includes("ايضاح") || lower.includes("ملاحظة")

    if (yearCols.length > 0 && yearCols[0].col === i) {
      isCurrent = true
    } else if (yearCols.length > 1) {
      isComparative = yearCols.slice(1).some((yc) => yc.col === i)
    } else if (i === 0 && !isNotes) {
      // No year headers — assume first non-notes column is current
      isCurrent = true
    } else if (i > 0 && !isNotes) {
      isComparative = true
    }

    result.push({
      colIndex: i,
      periodLabel: yearMatch ? headerText : null,
      isCurrent,
      isComparative,
      isRestated,
      isNotes,
    })
  }

  return result
}

// ---------------------------------------------------------------------------
// Label matching with note-number stripping
// ---------------------------------------------------------------------------
function matchLabelWithContext(
  labelText: string,
): { code: string; def: RawMetricDef; cleanedLabel: string; noteNumber: number | null; isSectionNumber: boolean } | null {
  if (!labelText) return null

  // Strip leading note/section numbers FIRST
  const { cleaned, noteNumber, isSectionNumber } = stripLeadingNumber(labelText)
  const textToMatch = cleaned || labelText

  const isAr = isArabic(textToMatch)
  const norm = isAr ? normalizeArabic(textToMatch) : normalizeLatin(textToMatch)
  if (!norm || norm.length < 3) return null

  // Try exact match first
  for (const entry of ALIAS_INDEX) {
    if (entry.language === "AR" && !isAr) continue
    if (entry.language === "EN" && isAr) continue
    if (entry.normalized === norm) {
      return { code: entry.code, def: entry.raw, cleanedLabel: cleaned, noteNumber, isSectionNumber }
    }
  }

  // Try substring match (alias must be >= 4 chars to avoid false positives)
  for (const entry of ALIAS_INDEX) {
    if (entry.language === "AR" && !isAr) continue
    if (entry.language === "EN" && isAr) continue
    if (entry.normalized.length >= 4 && norm.includes(entry.normalized)) {
      return { code: entry.code, def: entry.raw, cleanedLabel: cleaned, noteNumber, isSectionNumber }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Find label cell in a row
// ---------------------------------------------------------------------------
function findLabelCell(row: ExtractionRow): ExtractionCell | null {
  let best: ExtractionCell | null = null
  for (const cell of row.cells) {
    if (cell.is_label && cell.raw_text) {
      if (!best || cell.raw_text.length > best.raw_text.length) {
        best = cell
      }
    }
  }
  if (!best) {
    for (const cell of row.cells) {
      if (cell.raw_text && /[a-zA-Z\u0600-\u06ff]/.test(cell.raw_text) && !cell.is_number) {
        best = cell
        break
      }
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Pick value cell with context awareness
// ---------------------------------------------------------------------------
function pickValueCellWithContext(
  row: ExtractionRow,
  labelCell: ExtractionCell | null,
  colPeriods: ColumnPeriodInfo[],
): { cell: ExtractionCell; colInfo: ColumnPeriodInfo } | null {
  if (!labelCell) return null

  const labelCol = labelCell.col_index
  const numerics = row.cells.filter((c) => c.is_number && c.numeric_value !== null && c.col_index !== labelCol)
  if (numerics.length === 0) return null

  // Strategy 1: Pick the current-period column (highest priority)
  const currentCols = numerics.filter((c) => {
    const info = colPeriods.find((cp) => cp.colIndex === c.col_index)
    return info && info.isCurrent && !info.isNotes
  })
  if (currentCols.length > 0) {
    const info = colPeriods.find((cp) => cp.colIndex === currentCols[0].col_index)
    return { cell: currentCols[0], colInfo: info! }
  }

  // Strategy 2: Pick the first numeric to the right of the label (not in notes column)
  const rightNumerics = numerics.filter((c) => {
    if (c.col_index <= labelCol) return false
    const info = colPeriods.find((cp) => cp.colIndex === c.col_index)
    return !info || !info.isNotes
  })
  if (rightNumerics.length > 0) {
    const info = colPeriods.find((cp) => cp.colIndex === rightNumerics[0].col_index)
    return { cell: rightNumerics[0], colInfo: info || colPeriods[0] }
  }

  // Strategy 3: Any numeric not in notes column
  const nonNotesNumerics = numerics.filter((c) => {
    const info = colPeriods.find((cp) => cp.colIndex === c.col_index)
    return !info || !info.isNotes
  })
  if (nonNotesNumerics.length > 0) {
    const info = colPeriods.find((cp) => cp.colIndex === nonNotesNumerics[0].col_index)
    return { cell: nonNotesNumerics[0], colInfo: info || colPeriods[0] }
  }

  return null
}

// ---------------------------------------------------------------------------
// Multi-factor confidence scoring
// ---------------------------------------------------------------------------
interface ConfidenceFactors {
  labelMatch: number       // 0-1: how well the label matches the alias
  tableMatch: number       // 0-1: is this from a proper table?
  columnMatch: number     // 0-1: was the value in the right column?
  periodMatch: number     // 0-1: is the period correct?
  statementMatch: number  // 0-1: is this from a primary statement?
  unitMatch: number        // 0-1: is the unit reasonable?
  valuePlausibility: number // 0-1: is the value magnitude plausible?
  noteNumberPenalty: number // 0-1: penalty if note number detected
}

function computeConfidence(factors: ConfidenceFactors): number {
  // Weighted average of factors
  const weights = {
    labelMatch: 0.15,
    tableMatch: 0.10,
    columnMatch: 0.15,
    periodMatch: 0.10,
    statementMatch: 0.20,
    unitMatch: 0.05,
    valuePlausibility: 0.15,
    noteNumberPenalty: 0.10,
  }
  let score = 0
  score += factors.labelMatch * weights.labelMatch
  score += factors.tableMatch * weights.tableMatch
  score += factors.columnMatch * weights.columnMatch
  score += factors.periodMatch * weights.periodMatch
  score += factors.statementMatch * weights.statementMatch
  score += factors.unitMatch * weights.unitMatch
  score += factors.valuePlausibility * weights.valuePlausibility
  score += factors.noteNumberPenalty * weights.noteNumberPenalty
  return Math.max(0, Math.min(1, score))
}

function getConfidenceTier(score: number): "VERIFIED" | "HIGH" | "MEDIUM" | "LOW" | "REJECT" {
  if (score >= 0.85) return "VERIFIED"
  if (score >= 0.70) return "HIGH"
  if (score >= 0.55) return "MEDIUM"
  if (score >= 0.40) return "LOW"
  return "REJECT"
}

// ---------------------------------------------------------------------------
// Value plausibility check
// ---------------------------------------------------------------------------
function checkValuePlausibility(value: number, metricCode: string): number {
  // Very small integers (1-50) are almost certainly note numbers or references
  if (Number.isInteger(value) && value >= 1 && value <= 50) {
    return 0.1 // Very unlikely to be a real financial value
  }
  // Small decimals (1-10 with decimal) could be EPS, ratios, percentages
  if (value >= 0.01 && value <= 10) {
    // Check if this is a per-share or ratio metric
    const perShareMetrics = ["EPS", "BASIC_EPS", "DILUTED_EPS", "DIVIDEND_PER_SHARE", "DPS_DECLARED", "BOOK_VALUE_PER_SHARE"]
    if (perShareMetrics.includes(metricCode)) return 0.8 // plausible for per-share
    return 0.3 // suspicious for non-per-share metrics
  }
  // Values in the 100-1000000 range are plausible for financial values in millions
  if (value >= 100 && value <= 10000000) return 0.9
  // Very large values are fine for big companies
  if (value > 10000000) return 0.8
  // Values 50-100 — borderline
  if (value >= 50 && value < 100) return 0.4
  // Negative values are fine for expenses/losses
  if (value < 0) return 0.7
  // Zero is fine
  if (value === 0) return 0.6
  return 0.5
}

// ---------------------------------------------------------------------------
// Main extraction: process a table row with full context
// ---------------------------------------------------------------------------
function matchTableRowWithContext(
  table: ExtractionTable,
  row: ExtractionRow,
  page: ExtractionPage,
  pageSection: StatementSection,
  tableSection: StatementSection,
  colPeriods: ColumnPeriodInfo[],
  unit: string,
  currency: string,
): MatchedCandidate | null {
  const labelCell = findLabelCell(row)
  if (!labelCell || !labelCell.raw_text) return null

  // Match label with note-number stripping
  const match = matchLabelWithContext(labelCell.raw_text)
  if (!match) return null

  // If note number was stripped, the label was something like "8 . Earnings per share"
  // This means we're in a NOTE section, not a primary statement
  const isFromNote = match.noteNumber !== null || tableSection === "NOTE"

  // Pick value cell using column period info
  const valueResult = pickValueCellWithContext(row, labelCell, colPeriods)
  if (!valueResult || valueResult.cell.numeric_value === null) return null

  const value = valueResult.cell.numeric_value

  // CRITICAL: Reject if the value is a likely note/page/year number
  if (isLikelyNoteOrPageNumber(value, labelCell.raw_text)) {
    return null // Silent rejection — do not store this as a FinancialValue
  }

  // CRITICAL: Reject narrative text — labels that are full sentences are not financial line items
  // Financial labels are typically short (e.g. "Total Assets", "Net Profit", "Revenue")
  // Narrative labels contain verbs/adverbs/narrative markers.
  const lowerLabel = labelCell.raw_text.toLowerCase()
  const wordCount = lowerLabel.split(/\s+/).filter(Boolean).length
  const isNarrative =
    // Existing rules
    lowerLabel.includes("during the") || lowerLabel.includes("the company") ||
    lowerLabel.includes(" is ") || lowerLabel.includes(" was ") ||
    lowerLabel.includes(" are ") || lowerLabel.includes(" were ") ||
    lowerLabel.includes("obtained") || lowerLabel.includes("issued") ||
    lowerLabel.includes("entered into") || lowerLabel.includes("agreement") ||
    lowerLabel.includes("repurchased") || lowerLabel.includes("subsequently") ||
    // New aggressive rules — narrative sentence markers
    lowerLabel.includes("for telecom") || lowerLabel.includes("for telecom egypt") ||
    lowerLabel.includes("a total of") || lowerLabel.includes("a number of") ||
    lowerLabel.includes("a percentage of") || lowerLabel.includes("as a percentage") ||
    lowerLabel.includes("enhanced by") || lowerLabel.includes("increased by") ||
    lowerLabel.includes("decreased by") || lowerLabel.includes("reached") ||
    lowerLabel.includes("achieved") || lowerLabel.includes("recorded") ||
    lowerLabel.includes("compared to") || lowerLabel.includes("in addition") ||
    lowerLabel.includes("in order to") || lowerLabel.includes("in accordance") ||
    lowerLabel.includes("in 2021") || lowerLabel.includes("in 2022") ||
    lowerLabel.includes("in 2023") || lowerLabel.includes("in 2024") ||
    lowerLabel.includes("the dividend") || lowerLabel.includes("the resolution") ||
    lowerLabel.includes("will be") || lowerLabel.includes("was held") ||
    lowerLabel.includes("were granted") || lowerLabel.includes("were taken") ||
    lowerLabel.includes("article") || lowerLabel.includes("resolution") ||
    lowerLabel.includes("market subscribers") || // "MOBILE DATA MARKET SUBSCRIBERS (IN 000s)" — chart caption
    lowerLabel.includes("branch network") ||
    lowerLabel.includes("participants to join") ||
    lowerLabel.includes("steps were taken") || lowerLabel.includes("number of steps") ||
    lowerLabel.includes("labor market") || lowerLabel.includes("hospital 57357") ||
    lowerLabel.includes("cancer hospital") ||
    lowerLabel.includes("resolution is unanimous") ||
    // Very long labels are usually narrative, not line items — tightened from 12 to 8 words
    wordCount > 8
  if (isNarrative) {
    return null
  }

  // CRITICAL: Reject if the matched alias appears MID-narrative (i.e., the label
  // contains the alias as part of a longer sentence, not as a standalone line item).
  // Example: "as a percentage of revenue, EBITDA enhanced by 28% YoY" should NOT
  // match REVENUE alias "revenue" — it's a narrative paragraph.
  // Heuristic: alias should be at the START of the label (after note-number stripping)
  // OR the label length should be within 2x of the alias length.
  const aliasNormalized = match.def.aliases.find((a) => {
    const isAr = isArabic(a)
    const norm = isAr ? normalizeArabic(a) : normalizeLatin(a)
    return norm && norm.length >= 4 && normalizeLatin(labelCell.raw_text).includes(norm)
  })
  if (aliasNormalized) {
    const aliasNorm = isArabic(aliasNormalized) ? normalizeArabic(aliasNormalized) : normalizeLatin(aliasNormalized)
    const labelNorm = isArabic(labelCell.raw_text) ? normalizeArabic(labelCell.raw_text) : normalizeLatin(labelCell.raw_text)
    // If the alias is not at the start (after stripping spaces) AND the label is much longer
    // than the alias, it's likely a narrative paragraph that just happens to contain the alias.
    if (aliasNorm && labelNorm) {
      const aliasIdx = labelNorm.indexOf(aliasNorm)
      const isAtStart = aliasIdx <= 3 // allow some leading whitespace
      const labelIsMuchLonger = labelNorm.length > aliasNorm.length * 2.5
      if (!isAtStart && labelIsMuchLonger) {
        return null // Narrative — alias appears mid-sentence
      }
    }
  }

  // CRITICAL: If note number was detected and the value is small, reject
  if (match.noteNumber !== null && value === match.noteNumber) {
    return null // The "value" IS the note number — reject
  }

  // CRITICAL: If section number was detected, check if value matches the section number
  // e.g. "14.1 . Profits" → section number is "14.1", value extracted is 14.1 → REJECT
  if (match.isSectionNumber && value < 100) {
    // The value is likely the section number itself (e.g. 14.1, 3.2, 1.1)
    return null
  }

  // CRITICAL: If any note/section number was stripped and value < 100, be very suspicious
  // Financial values in millions/thousands are virtually never < 100 (except per-share metrics)
  if (match.noteNumber !== null && value < 100) {
    const perShareMetrics = ["EPS", "BASIC_EPS", "DILUTED_EPS", "DIVIDEND_PER_SHARE", "DPS_DECLARED", "BOOK_VALUE_PER_SHARE"]
    if (!perShareMetrics.includes(match.code)) {
      return null // Small value from a note/section context — almost certainly the note number
    }
  }

  // Compute multi-factor confidence
  const numericCount = row.cells.filter(
    (c) => c.is_number && c.numeric_value !== null && c !== labelCell,
  ).length

  const factors: ConfidenceFactors = {
    labelMatch: match.noteNumber !== null ? 0.7 : 0.9, // lower if note number was stripped
    tableMatch: 0.9, // we're in a table
    columnMatch: valueResult.colInfo.isCurrent ? 0.95 : valueResult.colInfo.isComparative ? 0.7 : 0.5,
    periodMatch: 0.8, // default — would need document-level period detection
    statementMatch: isFromNote ? 0.4 : tableSection.startsWith("PRIMARY") ? 0.95 : 0.5,
    unitMatch: 0.8, // default — would need unit detection per cell
    valuePlausibility: checkValuePlausibility(value, match.code),
    noteNumberPenalty: match.noteNumber !== null ? 0.3 : 1.0, // big penalty if note number was detected
  }

  const confidence = computeConfidence(factors)
  const tier = getConfidenceTier(confidence)

  // REJECT low-confidence values — do not store them as trusted financial data
  if (tier === "REJECT") {
    return null
  }

  const group = METRIC_CODE_TO_GROUP[match.code] ?? match.def.group
  const displayOrder = match.def.displayOrder

  return {
    metricCode: match.code,
    originalLabel: labelCell.raw_text, // preserve original label (with note number)
    value,
    unit,
    currency,
    sourcePage: page.page,
    sourceTable: table.table_index,
    sourceRow: row.row_index,
    sourceCol: valueResult.cell.col_index,
    sourceBbox: valueResult.cell.bbox,
    extractionMethod: "PDF_TABLE",
    confidence,
    group,
    subPeriod: valueResult.colInfo.isComparative ? "COMPARATIVE" : "CURRENT",
    isRestated: valueResult.colInfo.isRestated,
    displayOrder,
    statementSection: tableSection,
    valueType: "REPORTED",
  }
}

// ---------------------------------------------------------------------------
// Line matching (fallback — much stricter than before)
// ---------------------------------------------------------------------------
function matchLineStrict(
  line: ExtractionLine,
  page: ExtractionPage,
  pageSection: StatementSection,
  unit: string,
  currency: string,
): MatchedCandidate | null {
  if (!line.text) return null

  // Only match English/mixed lines (pure Arabic lines lack reliable column structure)
  if (isArabic(line.text)) return null

  const match = matchLabelWithContext(line.text)
  if (!match) return null

  // For line matching, the line must have a numeric value
  if (!line.is_number || line.numeric_value === null) return null

  const value = line.numeric_value

  // CRITICAL: Line-based extraction of small integers is almost always wrong.
  // Financial values in millions/thousands are never 1-50 (except per-share metrics).
  // This catches note numbers, page numbers, section numbers, date days, etc.
  if (Number.isInteger(value) && value >= 1 && value <= 50) {
    const perShareMetrics = ["EPS", "BASIC_EPS", "DILUTED_EPS", "DIVIDEND_PER_SHARE", "DPS_DECLARED", "BOOK_VALUE_PER_SHARE"]
    if (!perShareMetrics.includes(match.code)) {
      return null
    }
  }

  // CRITICAL: Reject note numbers
  if (isLikelyNoteOrPageNumber(value, line.text)) return null
  if (match.noteNumber !== null && value === match.noteNumber) return null
  // Reject section numbers as values
  if (match.isSectionNumber && value < 100) return null
  // Reject small values from note/section contexts
  if (match.noteNumber !== null && value < 100) {
    const perShareMetrics = ["EPS", "BASIC_EPS", "DILUTED_EPS", "DIVIDEND_PER_SHARE", "DPS_DECLARED", "BOOK_VALUE_PER_SHARE"]
    if (!perShareMetrics.includes(match.code)) return null
  }

  // CRITICAL: Reject narrative text in line matching — TIGHTENED rules
  const lowerLine = line.text.toLowerCase()
  const lineWordCount = lowerLine.split(/\s+/).filter(Boolean).length
  const isNarrative = lowerLine.includes("during the") || lowerLine.includes("the company") ||
    lowerLine.includes(" is ") || lowerLine.includes(" was ") ||
    lowerLine.includes("obtained") || lowerLine.includes("issued") ||
    lowerLine.includes("entered into") || lowerLine.includes("agreement") ||
    lowerLine.includes("subsequently") ||
    // New aggressive rules (mirror the table-context rules)
    lowerLine.includes("for telecom") ||
    lowerLine.includes("a total of") || lowerLine.includes("a number of") ||
    lowerLine.includes("a percentage of") || lowerLine.includes("as a percentage") ||
    lowerLine.includes("enhanced by") || lowerLine.includes("increased by") ||
    lowerLine.includes("decreased by") || lowerLine.includes("reached") ||
    lowerLine.includes("achieved") || lowerLine.includes("recorded") ||
    lowerLine.includes("compared to") || lowerLine.includes("in addition") ||
    lowerLine.includes("in order to") || lowerLine.includes("in accordance") ||
    lowerLine.includes("the dividend") || lowerLine.includes("the resolution") ||
    lowerLine.includes("will be") || lowerLine.includes("was held") ||
    lowerLine.includes("were granted") || lowerLine.includes("were taken") ||
    lowerLine.includes("article") || lowerLine.includes("resolution") ||
    lowerLine.includes("market subscribers") ||
    lowerLine.includes("branch network") ||
    lowerLine.includes("participants to join") ||
    lowerLine.includes("steps were taken") || lowerLine.includes("number of steps") ||
    lowerLine.includes("labor market") || lowerLine.includes("hospital") ||
    lowerLine.includes("cancer hospital") ||
    lowerLine.includes("resolution is unanimous") ||
    lineWordCount > 8  // tightened from 12 to 8
  if (isNarrative) return null

  // Line-based extraction is inherently lower confidence
  const factors: ConfidenceFactors = {
    labelMatch: match.noteNumber !== null ? 0.5 : 0.7,
    tableMatch: 0.3, // not in a table — low
    columnMatch: 0.4, // no column context
    periodMatch: 0.5,
    statementMatch: pageSection.startsWith("PRIMARY") ? 0.6 : 0.3,
    unitMatch: 0.5,
    valuePlausibility: checkValuePlausibility(value, match.code),
    noteNumberPenalty: match.noteNumber !== null ? 0.2 : 0.8,
  }

  const confidence = computeConfidence(factors)
  if (getConfidenceTier(confidence) === "REJECT") return null

  const group = METRIC_CODE_TO_GROUP[match.code] ?? match.def.group
  return {
    metricCode: match.code,
    originalLabel: line.text,
    value,
    unit,
    currency,
    sourcePage: page.page,
    sourceTable: null,
    sourceRow: null,
    sourceCol: 0,
    sourceBbox: line.bbox,
    extractionMethod: "PDF_TEXT",
    confidence,
    group,
    subPeriod: "CURRENT",
    isRestated: false,
    displayOrder: match.def.displayOrder,
    statementSection: pageSection,
    valueType: "REPORTED",
  }
}

// ---------------------------------------------------------------------------
// Main: run context-aware extraction
// ---------------------------------------------------------------------------
export function matchMetrics(
  extraction: ExtractionResult,
  opts?: { defaultUnit?: string; defaultCurrency?: string; companySector?: string },
): MatchedCandidate[] {
  const unit = opts?.defaultUnit ?? extraction.metadata?.unit ?? extraction.document?.unit ?? "MILLION"
  const currency = opts?.defaultCurrency ?? extraction.metadata?.currency ?? extraction.document?.currency ?? "EGP"
  const companySector = opts?.companySector

  // Sector-based metric filtering — e.g. skip BANK_* metrics for a telecom company
  // (sector KPIs like BANK_NIM, BANK_LDR shouldn't match in a Telecom Egypt PDF
  // even if the keywords happen to appear in narrative text)
  const sectorApplicableCodes = new Set<string>()
  for (const m of RAW_METRICS) {
    if (!m.appliesToSectors || m.appliesToSectors.length === 0) {
      sectorApplicableCodes.add(m.code) // universal
      continue
    }
    if (companySector) {
      const sectorLower = companySector.toLowerCase()
      const isBank = sectorLower.includes("bank")
      const isFinServ = sectorLower.includes("financial services") || sectorLower.includes("financial_services")
      const appliesToBanks = m.appliesToSectors.some((s) => s.toLowerCase().includes("bank"))
      const appliesToFinServ = m.appliesToSectors.some((s) => s.toLowerCase().includes("financial services"))
      if ((appliesToBanks && isBank) || (appliesToFinServ && isFinServ) ||
          m.appliesToSectors.some((s) => sectorLower.includes(s.toLowerCase()))) {
        sectorApplicableCodes.add(m.code)
      }
      // Skip metrics that apply to a DIFFERENT sector than the company's
      // e.g. BANK_NIM should NOT match when company sector is "Telecom"
    }
  }

  // Collect ALL candidates (not just first match per metric)
  const allCandidates: MatchedCandidate[] = []

  for (const page of extraction.pages) {
    const pageSection = classifyPageSection(page)

    for (const table of page.tables) {
      const tableSection = classifyTableSection(table, pageSection)
      const colPeriods = detectColumnPeriods(table)

      for (const row of table.rows) {
        const cand = matchTableRowWithContext(
          table, row, page, pageSection, tableSection, colPeriods, unit, currency,
        )
        // Apply sector filter — skip metrics that don't apply to this company's sector
        if (cand && companySector && !sectorApplicableCodes.has(cand.metricCode)) {
          continue
        }
        if (cand) allCandidates.push(cand)
      }
    }

    // Line fallback — for primary statements AND other pages with financial table content
    // (many EGX PDFs have their financial data in lines, not in properly structured tables)
    for (const line of page.lines) {
      const cand = matchLineStrict(line, page, pageSection, unit, currency)
      // Apply sector filter — skip metrics that don't apply to this company's sector
      if (cand && companySector && !sectorApplicableCodes.has(cand.metricCode)) {
        continue
      }
      if (cand) allCandidates.push(cand)
    }
  }

  // Multi-candidate selection: for each metric, pick the best candidate by confidence
  const bestPerMetric = new Map<string, MatchedCandidate>()
  for (const cand of allCandidates) {
    const key = `${cand.metricCode}|${cand.subPeriod || "CURRENT"}`
    const prev = bestPerMetric.get(key)
    if (!prev || cand.confidence > prev.confidence) {
      bestPerMetric.set(key, cand)
    }
  }

  const result = Array.from(bestPerMetric.values())
  // Sort: display order asc, confidence desc
  result.sort((a, b) => {
    const ao = a.displayOrder ?? 9999
    const bo = b.displayOrder ?? 9999
    if (ao !== bo) return ao - bo
    return b.confidence - a.confidence
  })

  return result
}

export { getMetricGroup, matchLabelWithContext as matchLabel }
