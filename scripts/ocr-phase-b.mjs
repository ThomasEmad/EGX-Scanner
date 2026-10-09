// OCR phase-B: parse per-page OCR text into financial values (ALL statement
// types), normalize Arabic-Indic digits, and emit supplement-schema records.
// Usage: node ocr-phase-b.mjs <ticker> <ocrJsonlPath> <outJsonPath>
import fs from "fs"

const [ticker, jsonlPath, outPath] = process.argv.slice(2)
if (!ticker || !jsonlPath) { console.error("usage: node ocr-phase-b.mjs <ticker> <jsonl> <out>"); process.exit(1) }

const AR_DIGITS = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" }
function normalizeDigits(s) {
  return s.replace(/[٠-٩]/g, (d) => AR_DIGITS[d] ?? d)
}

// label → canonical code (matched by substring against normalized line text)
const LABEL_MAP = [
  ["قائمة المركز المالي", "__BS_HEADER__"],
  ["إجمالي الأصول المتداولة", "CURRENT_ASSETS"],
  ["مجموع الأصول المتداولة", "CURRENT_ASSETS"],
  ["إجمالي الأصول", "TOTAL_ASSETS"],
  ["مجموع الأصول", "TOTAL_ASSETS"],
  ["إجمالي الخصوم المتداولة", "CURRENT_LIABILITIES"],
  ["إجمالي المطلوبات المتداولة", "CURRENT_LIABILITIES"],
  ["إجمالي الخصوم", "TOTAL_LIABILITIES"],
  ["إجمالي المطلوبات", "TOTAL_LIABILITIES"],
  ["إجمالي حقوق الملكية", "TOTAL_EQUITY"],
  ["إجمالي حقوق المساهمين", "TOTAL_EQUITY"],
  ["حقوق المساهمين", "TOTAL_EQUITY"],
  ["الإيرادات المحققة", "REVENUE"],
  ["إيرادات الأنشطة العادية", "REVENUE"],
  ["الإيرادات", "REVENUE"],
  ["تكلفة الإيرادات", "COGS"],
  ["تكلفة الأنشطة العادية", "COGS"],
  ["مجمل الربح", "GROSS_PROFIT"],
  ["أرباح الأنشطة العادية", "OPERATING_INCOME"],
  ["الربح التشغيلي", "OPERATING_INCOME"],
  ["صافي ربح الفترة", "NET_PROFIT"],
  ["صافي الربح للفترة", "NET_PROFIT"],
  ["صافي أرباح الأنشطة العادية", "NET_PROFIT"],
  ["صافي الربح", "NET_PROFIT"],
  ["صافي خسارة الفترة", "NET_PROFIT"],
  ["الأنشطة التشغيلية", "OPERATING_CASH_FLOW"],
  ["الأنشطة الاستثمارية", "INVESTING_CASH_FLOW"],
  ["الأنشطة التمويلية", "FINANCING_CASH_FLOW"],
]

// order matters: specific labels before generic ("إجمالي الأصول المتداولة" must
// not be eaten by "إجمالي الأصول") — sort by label length desc when matching.
const SORTED = [...LABEL_MAP].sort((a, b) => b[0].length - a[0].length)

function parseNumbers(line) {
  // find numeric tokens: optional minus, digits with , or Arabic thousands separator, optional decimals
  const out = []
  const cleaned = normalizeDigits(line).replace(/[٬،]/g, ",")
  const re = /-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+\.\d+|-?\d{4,}/g
  let m
  while ((m = re.exec(cleaned)) !== null) {
    const v = Number(m[0].replace(/,/g, ""))
    if (Number.isFinite(v)) out.push(v)
  }
  return out
}

function parsePeriodEnd(text) {
  // "عن الفترة المالية المنتهية في 30 سبتمبر 2024" / Arabic month names
  const months = { "يناير": 1, "فبراير": 2, "مارس": 3, "أبريل": 4, "ابريل": 4, "مايو": 5, "يونيو": 6, "يوليو": 7, "أغسطس": 8, "اغسطس": 8, "سبتمبر": 9, "أكتوبر": 10, "اكتوبر": 10, "نوفمبر": 11, "ديسمبر": 12 }
  const t = normalizeDigits(text)
  for (const [mn, num] of Object.entries(months)) {
    const re = new RegExp(`(\\d{1,2})\\s+${mn}\\s+(20\\d\\d)`)
    const m = t.match(re)
    if (m) return `${m[3]}-${String(num).padStart(2, "0")}-${m[1].padStart(2, "0")}`
  }
  return null
}

const pages = fs.readFileSync(jsonlPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
const fullText = pages.map((p) => p.text).join("\n")
const periodEnd = parsePeriodEnd(fullText)
const periodEndPage = pages.find((p) => parsePeriodEnd(p.text))?.page ?? null

// units: Egyptian statements are in EGP units (whole pounds) — sanity bounds
const MIN = 5e4 // 50k EGP minimum for a statement line
const MAX = 5e13 // 50 trillion max

const records = []
for (const p of pages) {
  const lines = p.text.split("\n").map((l) => l.trim()).filter(Boolean)
  for (let i = 0; i < lines.length; i++) {
    const line = normalizeDigits(lines[i])
    for (const [label, code] of SORTED) {
      if (!line.includes(label) || code.startsWith("__")) continue
      // numbers on the same line; if none, try the next 1-2 lines (stacked layout)
      let nums = parseNumbers(line)
      if (nums.length === 0 && i + 1 < lines.length) nums = parseNumbers(lines[i + 1])
      if (nums.length === 0) continue
      const value = nums[0] // current-period column
      if (Math.abs(value) < MIN || Math.abs(value) > MAX) break
      records.push({ ticker, code, page: p.page, label, value, allNums: nums.slice(0, 3) })
      break
    }
  }
}

// dedupe: keep first occurrence per code (statement headers repeat labels)
const byCode = new Map()
for (const r of records) if (!byCode.has(r.code)) byCode.set(r.code, r)

const out = { ticker, periodEnd, periodEndPage, candidates: [...byCode.values()], rawCount: records.length }
fs.writeFileSync(outPath, JSON.stringify(out, null, 1), "utf8")
console.log(JSON.stringify({ periodEnd, periodEndPage, codesFound: [...byCode.keys()], values: out.candidates.map((c) => ({ code: c.code, v: c.value, page: c.page, label: c.label })) }, null, 1))
