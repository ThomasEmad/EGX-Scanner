// Import annual financial statements from Mubasher's public company page.
//
// Mubasher embeds `midata.financialStatement` in the HTML: periods (Q1..Q4 and
// the annual budget), sections (balance sheet / income / cash flow), and rows
// with one value per fiscal year. Annual rows are printed in thousands while
// quarterly rows are in units.
//
// The page is CDN-cached and can return different versions on consecutive
// requests. A known failure is the annual row being replaced by the Q4
// standalone row (e.g. VLMR FY2024 net profit 126,945.188k instead of the
// full-year 163,028.53k). This importer therefore samples the page three times,
// drops any annual value that equals the Q4 value for the same metric/year, and
// imports only values that agree across the remaining samples. A genuine
// disagreement is recorded and left unresolved rather than guessed.
//
// Safety:
//   * only annual periods are imported (never Q1-Q4 as annual);
//   * only metrics in the project registry are mapped;
//   * cash-flow rows are skipped until their legs reconcile;
//   * balance-sheet identity is checked before a value is marked VALID;
//   * every write is recorded for rollback.
//
// Usage:
//   node scripts/import-mubasher-annual.mjs --ticker VLMR            # dry run
//   node scripts/import-mubasher-annual.mjs --ticker VLMR --apply    # write

import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const tickerArg = process.argv.find((a) => a.startsWith("--ticker="))
const ticker = tickerArg ? tickerArg.split("=")[1] : process.argv[process.argv.indexOf("--ticker") + 1]
if (!ticker) {
  console.error("Usage: node scripts/import-mubasher-annual.mjs --ticker VLMR [--apply]")
  process.exit(1)
}

const OUT = path.join(process.cwd(), "reports")
const URL_EN = `https://english.mubasher.info/markets/EGX/stocks/${ticker}/financial-statements`
const URL_AR = `https://www.mubasher.info/markets/EGX/stocks/${ticker}/financial-statements`
const SAMPLE_COUNT = 3
const SAMPLE_DELAY_MS = 1200

const CASH_FLOW_CODES = new Set([
  "OPERATING_CASH_FLOW",
  "INVESTING_CASH_FLOW",
  "FINANCING_CASH_FLOW",
  "NET_CHANGE_IN_CASH",
])

function normLabel(s) {
  return String(s || "")
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    .replace(/\s+/g, " ")
    .trim()
}

const METRIC_MAP = new Map(
  [
    ["إجمالي الأصول", { code: "TOTAL_ASSETS", statementType: "BALANCE_SHEET", group: "balance.assets" }],
    ["إجمالي المطلوبات", { code: "TOTAL_LIABILITIES", statementType: "BALANCE_SHEET", group: "balance.liabilities" }],
    [
      "اجمالي حقوق المساهمين مضاف اليها حقوق الاقلية",
      { code: "TOTAL_EQUITY", statementType: "BALANCE_SHEET", group: "balance.equity" },
    ],
    [
      "إجمالي المطلوبات وحقوق المساهمين",
      { code: "TOTAL_EQUITY_AND_LIABILITIES", statementType: "BALANCE_SHEET", group: "balance.liabilities_equity" },
    ],
    ["صافى الربح", { code: "NET_PROFIT", statementType: "INCOME_STATEMENT", group: null }],
    ["صافي الربح", { code: "NET_PROFIT", statementType: "INCOME_STATEMENT", group: null }],
    ["مجمل الربح", { code: "GROSS_PROFIT", statementType: "INCOME_STATEMENT", group: null }],
    // English page labels
    ["Total Assets", { code: "TOTAL_ASSETS", statementType: "BALANCE_SHEET", group: "balance.assets" }],
    ["Total Liabilities", { code: "TOTAL_LIABILITIES", statementType: "BALANCE_SHEET", group: "balance.liabilities" }],
    ["Total Shareholders' Equity", { code: "TOTAL_EQUITY", statementType: "BALANCE_SHEET", group: "balance.equity" }],
    ["Total Owners' Equity & Minority Interest Equity", { code: "TOTAL_EQUITY", statementType: "BALANCE_SHEET", group: "balance.equity" }],
    ["Total Equity", { code: "TOTAL_EQUITY", statementType: "BALANCE_SHEET", group: "balance.equity" }],
    [
      "Total Liabilities & Shareholders' Equity",
      { code: "TOTAL_EQUITY_AND_LIABILITIES", statementType: "BALANCE_SHEET", group: "balance.liabilities_equity" },
    ],
    ["Net Income or Loss", { code: "NET_PROFIT", statementType: "INCOME_STATEMENT", group: null }],
    ["Net Profit", { code: "NET_PROFIT", statementType: "INCOME_STATEMENT", group: null }],
    ["Gross Profit", { code: "GROSS_PROFIT", statementType: "INCOME_STATEMENT", group: null }],
  ].map(([label, meta]) => [normLabel(label), meta]),
)

function extractLiteral(html, marker) {
  const start = html.indexOf(marker)
  if (start < 0) throw new Error("financialStatement marker not found")
  const brace = html.indexOf("{", start)
  let depth = 0
  let inString = false
  let quote = null
  let escaped = false
  for (let i = brace; i < html.length; i++) {
    const ch = html[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === quote) inString = false
      continue
    }
    if (ch === "'" || ch === '"') {
      inString = true
      quote = ch
      continue
    }
    if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) return html.slice(brace, i + 1)
    }
  }
  throw new Error("unbalanced financialStatement literal")
}

async function load(url) {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } })
  if (!res.ok) throw new Error(`Mubasher HTTP ${res.status}`)
  const html = await res.text()
  const literal = extractLiteral(html, "midata.financialStatement = ")
  const data = vm.runInNewContext(`(${literal})`, {}, { timeout: 2000 })
  return { html, data }
}

function findPeriod(data, kind) {
  const periods = data.periods ?? []
  if (kind === "annual") {
    return periods.find((p) => /annual/i.test(p.label) || normLabel(p.label).includes("الميزانيه السنويه"))
  }
  return periods.find((p) => /fourth/i.test(p.label) || normLabel(p.label).includes("الربع الرابع"))
}

function buildMetricMap(data, kind) {
  const period = findPeriod(data, kind)
  const map = new Map()
  for (const section of period?.sections ?? []) {
    for (const record of section.records ?? []) {
      const meta = METRIC_MAP.get(normLabel(record.label))
      if (!meta) continue
      if (!map.has(meta.code)) map.set(meta.code, { meta, record, sectionLabel: section.label })
    }
  }
  return map
}

function uniqueWithin(values, relTolerance = 0.005) {
  const unique = []
  for (const v of values) {
    if (!unique.some((u) => Math.abs(u - v) <= Math.max(Math.abs(u) * relTolerance, 1))) unique.push(v)
  }
  return unique
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let usedUrl = URL_EN
const samples = []
for (let i = 0; i < SAMPLE_COUNT; i++) {
  try {
    samples.push(await load(URL_EN))
  } catch (e) {
    if (i === 0) console.warn(`English page unavailable (${e.message})`)
  }
  if (i < SAMPLE_COUNT - 1) await sleep(SAMPLE_DELAY_MS)
}
if (samples.length === 0) {
  usedUrl = URL_AR
  samples.push(await load(URL_AR))
}

const first = samples[0]
const currencyMatch = String(first.data.currency || "").match(/\((EGP|USD|EUR)\)/i)
const currency = currencyMatch ? currencyMatch[1].toUpperCase() : "EGP"

const sampleMaps = samples.map((s) => ({
  sample: s,
  annual: buildMetricMap(s.data, "annual"),
  q4: buildMetricMap(s.data, "q4"),
}))

const firstAnnual = sampleMaps[0].annual
const years = new Set()
for (const { record } of firstAnnual.values()) {
  for (const [year, value] of Object.entries(record.values ?? {})) {
    if (value !== null && Number.isFinite(Number(value))) years.add(Number(year))
  }
}

const company = await db.company.findUnique({
  where: { ticker: ticker.toUpperCase() },
  select: { id: true, ticker: true, nameEn: true },
})
if (!company) throw new Error(`Company ${ticker} not found`)

const rollback = {
  ticker: company.ticker,
  source: usedUrl,
  samples: samples.length,
  generatedAt: new Date().toISOString(),
  reports: [],
  values: [],
}
let reportsCreated = 0
let valuesCreated = 0
let valuesSkipped = 0
const summary = []
const skipped = []
const conflicts = []

for (const year of [...years].sort()) {
  const periodEnd = new Date(Date.UTC(year, 11, 31))
  if (periodEnd.getTime() > Date.now()) continue

  // Annual Mubasher values are printed in thousands; detect the scale from a
  // balance-sheet stock metric where the annual and Q4 year-end values should
  // be the same number in different units.
  let unit = "THOUSAND"
  for (const code of ["TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY"]) {
    const annualValue = sampleMaps[0].annual.get(code)?.record.values?.[String(year)]
    const q4Value = sampleMaps[0].q4.get(code)?.record.values?.[String(year)]
    if (annualValue && q4Value) {
      const ratio = Math.abs(Number(q4Value) / Number(annualValue))
      if (ratio > 500) unit = "THOUSAND"
      else if (ratio > 0.5 && ratio < 2) unit = "UNIT"
      else if (ratio > 0.0005 && ratio < 0.002) unit = "MILLION"
      break
    }
  }
  const multiplier = unit === "THOUSAND" ? 1000 : unit === "MILLION" ? 1_000_000 : 1

  const values = []
  for (const [code, firstEntry] of firstAnnual) {
    if (CASH_FLOW_CODES.has(code)) {
      valuesSkipped++
      continue
    }
    const rawValues = []
    const q4Values = []
    for (const m of sampleMaps) {
      const raw = m.annual.get(code)?.record.values?.[String(year)]
      if (raw !== null && raw !== undefined && Number.isFinite(Number(raw))) rawValues.push(Number(raw))
      const q4 = m.q4.get(code)?.record.values?.[String(year)]
      if (q4 !== null && q4 !== undefined && Number.isFinite(Number(q4))) q4Values.push(Number(q4))
    }
    if (rawValues.length === 0) continue
    const q4 = q4Values.length ? q4Values[0] : null
    // For flow metrics the annual row must be a full-year figure, not the Q4
    // standalone row. Annual rows are in thousands while Q4 rows are in units,
    // so compare the scaled annual value with Q4. Balance-sheet values are
    // year-end stocks, so annual == Q4 is expected and must not be dropped.
    const nonCopy =
      firstEntry.meta.statementType === "BALANCE_SHEET"
        ? rawValues
        : rawValues.filter(
            (v) =>
              q4 === null ||
              (Math.abs(v * multiplier - q4) > Math.max(Math.abs(q4) * 0.005, 1) &&
                Math.abs(v - q4) > Math.max(Math.abs(q4) * 0.005, 1)),
          )
    const unique = uniqueWithin(nonCopy)
    if (unique.length !== 1) {
      valuesSkipped++
      const reason = unique.length === 0 ? "Q4_COPY" : "CONFLICT"
      conflicts.push({ year, metricCode: code, reason, rawValues, q4 })
      continue
    }
    const value = unique[0]
    values.push({
      metricCode: code,
      originalLabel: firstEntry.record.label,
      value,
      currency,
      unit,
      normalizedValue: value * multiplier,
      statementType: firstEntry.meta.statementType,
      group: firstEntry.meta.group,
      extractionMethod: "MANUAL_ENTRY",
      confidence: 0.9,
      validationStatus: "VALID",
      validationNotes: `Mubasher annual statement (${unit.toLowerCase()}), consensus of ${rawValues.length} samples`,
    })
  }

  if (!values.some((v) => v.metricCode === "NET_PROFIT")) {
    skipped.push({ year, reason: "NO_STABLE_NET_PROFIT" })
    continue
  }

  // Balance-sheet identity check on the normalized values.
  const get = (code) => values.find((v) => v.metricCode === code)?.normalizedValue
  const assets = get("TOTAL_ASSETS")
  const liabilities = get("TOTAL_LIABILITIES")
  const equity = get("TOTAL_EQUITY")
  let balanceNote = null
  if (assets !== undefined && liabilities !== undefined && equity !== undefined) {
    const gap = assets - (liabilities + equity)
    const tolerance = Math.max(Math.abs(assets) * 0.02, 2_000_000)
    if (Math.abs(gap) > tolerance) {
      balanceNote = `Balance identity gap ${gap} exceeds tolerance ${tolerance}`
      for (const v of values) {
        if (["TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY"].includes(v.metricCode)) {
          v.validationStatus = "NEEDS_REVIEW"
          v.validationNotes = `${v.validationNotes}; ${balanceNote}`
        }
      }
    }
  }

  const existing = await db.financialReport.findFirst({
    where: {
      companyId: company.id,
      fiscalYear: year,
      periodType: "ANNUAL",
      sourceName: "MUBASHER_FINANCIAL_STATEMENTS",
      deletedAt: null,
    },
    select: { id: true },
  })

  summary.push({
    year,
    values: values.length,
    balanceNote,
    reportId: existing?.id ?? null,
    metrics: values.map((v) => `${v.metricCode}:${v.normalizedValue}`),
  })

  if (!APPLY) continue

  let reportId = existing?.id
  if (!reportId) {
    const report = await db.financialReport.create({
      data: {
        companyId: company.id,
        reportType: "ANNUAL",
        periodType: "ANNUAL",
        statementType: "CONSOLIDATED",
        fiscalYear: year,
        periodLabel: `FY ${year}`,
        periodStart: new Date(Date.UTC(year, 0, 1)),
        periodEnd,
        language: "EN",
        sourceName: "MUBASHER_FINANCIAL_STATEMENTS",
        sourceUrl: usedUrl,
        processingStatus: "VALIDATED",
        extractionMethod: "MANUAL_ENTRY",
        parserVersion: "mubasher-annual@1",
        extractionConfidence: 0.9,
        notes:
          "Imported from Mubasher public financial statements. Equity line includes non-controlling interests, indicating consolidated statements.",
      },
      select: { id: true },
    })
    reportId = report.id
    reportsCreated++
    rollback.reports.push({ id: reportId, year })
  }

  for (const v of values) {
    const before = await db.financialValue.findUnique({
      where: { reportId_metricCode_subPeriod: { reportId, metricCode: v.metricCode, subPeriod: "CURRENT" } },
      select: { id: true, value: true, validationStatus: true },
    })
    rollback.values.push({
      reportId,
      metricCode: v.metricCode,
      oldValue: before?.value ?? null,
      oldStatus: before?.validationStatus ?? null,
      newValue: v.value,
    })
    await db.financialValue.upsert({
      where: { reportId_metricCode_subPeriod: { reportId, metricCode: v.metricCode, subPeriod: "CURRENT" } },
      create: {
        companyId: company.id,
        reportId,
        metricCode: v.metricCode,
        originalLabel: v.originalLabel,
        value: v.value,
        currency: v.currency,
        unit: v.unit,
        normalizedValue: v.normalizedValue,
        statementType: v.statementType,
        group: v.group,
        subPeriod: "CURRENT",
        extractionMethod: v.extractionMethod,
        confidence: v.confidence,
        validationStatus: v.validationStatus,
        validationNotes: v.validationNotes,
      },
      update: {
        value: v.value,
        currency: v.currency,
        unit: v.unit,
        normalizedValue: v.normalizedValue,
        statementType: v.statementType,
        group: v.group,
        validationStatus: v.validationStatus,
        validationNotes: v.validationNotes,
      },
    })
    valuesCreated++
  }
}

const result = {
  applied: APPLY,
  ticker: company.ticker,
  nameEn: company.nameEn,
  currency,
  samples: samples.length,
  years: [...years].sort(),
  reportsCreated,
  valuesCreated,
  valuesSkipped,
  summary,
  skipped,
  conflicts,
}
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, `mubasher-annual-${company.ticker}.json`), JSON.stringify(result, null, 2))
if (APPLY) {
  fs.writeFileSync(
    path.join(OUT, `mubasher-annual-${company.ticker}-rollback.json`),
    JSON.stringify(rollback, null, 2),
  )
}
console.log(JSON.stringify(result, null, 1))
if (!APPLY) console.log("Dry run only. Re-run with --apply to write.")
await db.$disconnect()
