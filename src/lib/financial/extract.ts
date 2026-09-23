// Extraction Engine (server-only).
// Pipeline: document → detect type → text extraction → table/line extraction →
// financial label detection (via metric registry aliases, EN + AR) → candidate
// values → validation. If extraction quality is insufficient => NEEDS_REVIEW.
// NEVER silently accept bad extraction, and NEVER invent values.

import { inflateSync, inflateRawSync } from "node:zlib"
import { RAW_METRICS } from "./registry"
import { isUnit, type Unit } from "./units"

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

// ---------------- PDF text extraction (text-based PDFs only) ----------------

interface PdfTextResult {
  text: string
  pages: number
  looksScanned: boolean
}

/** Minimal deterministic text extraction for simple text-based PDFs.
 *  Tries zlib inflate on each stream and parses BT/ET text-show operators.
 *  Returns looksScanned=true when almost no text is found (OCR fallback required). */
export function extractPdfText(buffer: Buffer): PdfTextResult {
  const raw = buffer.toString("latin1")
  const chunks: string[] = []
  const streamRe = /stream\r?\n?/g
  let match: RegExpExecArray | null
  let pageCountEstimate = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length || 1

  while ((match = streamRe.exec(raw)) !== null) {
    const start = match.index + match[0].length
    const end = raw.indexOf("endstream", start)
    if (end === -1) continue
    const streamBytes = buffer.subarray(start, end)
    let content = ""
    try {
      content = inflateSync(streamBytes).toString("latin1")
    } catch {
      try {
        content = inflateRawSync(streamBytes).toString("latin1")
      } catch {
        content = streamBytes.toString("latin1") // uncompressed stream
      }
    }
    if (content.includes("BT") || content.includes("Tj") || content.includes("TJ")) {
      chunks.push(content)
    }
    // keep streamRe.exec going
  }

  const textParts: string[] = []
  for (const content of chunks) {
    textParts.push(parseContentStream(content))
  }
  const text = textParts.join("\n")
  const alphanumeric = text.replace(/[^A-Za-z0-9\u0600-\u06FF]/g, "")
  return {
    text,
    pages: pageCountEstimate,
    looksScanned: alphanumeric.length < 40,
  }
}

function parseContentStream(content: string): string {
  // Mark line breaks at text-position operators
  let working = content
    .replace(/\bT\*/g, "\n")
    .replace(/\bTD\b/g, "\n")
    .replace(/\bET\b/g, "\n")
    .replace(/-?[\d.]+\s+Td/g, "\n")
    .replace(/-?[\d.]+\s+-?[\d.]+\s+Tm/g, "\n")

  const out: string[] = []
  // (text) Tj  and  [(text) -3 (text)] TJ
  const showRe = /\(((?:\\.|[^\\()])*)\)\s*Tj|\[((?:[^\[\]\\]|\\.)*)\]\s*TJ/g
  let m: RegExpExecArray | null
  while ((m = showRe.exec(working)) !== null) {
    if (m[1] !== undefined) {
      out.push(unescapePdfString(m[1]))
    } else if (m[2] !== undefined) {
      const inner = m[2].match(/\(((?:\\.|[^\\()])*)\)/g) || []
      out.push(inner.map((s) => unescapePdfString(s.slice(1, -1))).join(""))
    }
  }
  return out.join(" ")
}

function unescapePdfString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
}

// ---------------- Label detection / normalization ----------------

function normalizeLatin(s: string): string {
  return s
    .toLowerCase()
    .replace(/[():,.\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeArabic(s: string): string {
  return s
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "") // diacritics + tatweel
    .replace(/[\u0622\u0623\u0625]/g, "\u0627") // alef variants
    .replace(/\u0649/g, "\u064A") // alef maqsura → ya
    .replace(/\u0629/g, "\u0647") // ta marbuta → ha
    .replace(/[():,.\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

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

/** Detect reporting unit from document text ("in thousands", "بملايين", ...) */
export function detectReportUnit(text: string): Unit {
  const lower = text.toLowerCase()
  if (/بآلاف|بالألاف|in thousands|'000|000s of/.test(lower)) return "THOUSAND"
  if (/بالملايين|بالمليون|in millions|بالمليونات/.test(lower)) return "MILLION"
  if (/بالمليارات|in billions|بالمليار/.test(lower)) return "BILLION"
  return "UNIT"
}

const NUMBER_RE = /-?\(?\s*[\d][\d,]*(?:\.\d+)?\s*\)?/g

function parseNumberToken(token: string): number | null {
  const negative = /\(.*\)/.test(token) || /^-/.test(token.trim())
  let cleaned = token.replace(/[(),]/g, "").trim()
  if (cleaned.startsWith("-")) cleaned = cleaned.slice(1)
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

/** Match a line to a metric via alias index */
function matchMetric(lineNorm: string, isArabicLine: boolean): { code: string; alias: string } | null {
  const index = getAliasIndex()
  for (const entry of index) {
    if (entry.isArabic !== isArabicLine) continue
    if (entry.norm.length < 3) continue
    if (lineNorm.includes(entry.norm)) {
      return { code: entry.code, alias: entry.norm }
    }
  }
  return null
}

/** Extract candidate financial values from raw text lines */
export function extractFromText(text: string, opts?: { reportUnit?: Unit }): ExtractedCandidate[] {
  const reportUnit = opts?.reportUnit ?? detectReportUnit(text)
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  const candidates: ExtractedCandidate[] = []
  const usedCodes = new Set<string>()

  for (const line of lines) {
    const isArabicLine = /[\u0600-\u06FF]/.test(line)
    const lineNorm = isArabicLine ? normalizeArabic(line) : normalizeLatin(line)
    const metric = matchMetric(lineNorm, isArabicLine)
    if (!metric) continue
    if (usedCodes.has(metric.code)) continue // keep first occurrence per metric

    // find numbers on the same line (after removing the alias text)
    const numbers = line.match(NUMBER_RE) || []
    const parsed = numbers.map(parseNumberToken).filter((n): n is number => n !== null)
    if (parsed.length === 0) continue

    const value = parsed[0] // first number after the label = current period column
    const confidence = parsed.length === 1 ? 0.9 : 0.55 // ambiguous columns → lower confidence, review decides

    // per-line unit hint like "1,234 mn" / "12 m"
    let unit: Unit = reportUnit
    if (/\b(mn|millions?)\b/i.test(line)) unit = "MILLION"
    else if (/\b(bn|billions?)\b/i.test(line)) unit = "BILLION"
    else if (/\b(thousands?|000s)\b/i.test(line)) unit = "THOUSAND"

    usedCodes.add(metric.code)
    candidates.push({
      metricCode: metric.code,
      originalLabel: line.length > 160 ? line.slice(0, 160) : line,
      value,
      unit,
      currency: "EGP",
      sourcePage: null,
      sourceText: line.length > 240 ? line.slice(0, 240) : line,
      confidence,
    })
  }
  return candidates
}

/** Extract from CSV text: rows of label,value[,unit] */
export function extractFromCsv(text: string): ExtractedCandidate[] {
  const candidates: ExtractedCandidate[] = []
  const lines = text.split(/\r?\n/).filter(Boolean)
  for (const line of lines) {
    // skip header-ish lines
    if (/^\s*(label|metric|name)\s*[,;]/i.test(line)) continue
    const parts = line.split(/\s*[,;]\s*/)
    if (parts.length < 2) continue
    const label = parts[0].trim()
    const isArabicLine = /[\u0600-\u06FF]/.test(label)
    const lineNorm = isArabicLine ? normalizeArabic(label) : normalizeLatin(label)
    const metric = matchMetric(lineNorm, isArabicLine)
    if (!metric) continue
    const value = parseNumberToken(parts[1])
    if (value === null) continue
    const unitRaw = (parts[2] || "").trim().toUpperCase()
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
