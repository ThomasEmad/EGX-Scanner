// Fix the x1000 unit-scale corruption family (values stored 1000x too big because
// sources printed in EGP thousands but were normalized as absolute EGP).
// Evidence: probe dumps scripts/scale-dump-utf8.out, scale-dump3-utf8.out.
// Two reversible operations:
//   A) unit fix /1000: normalizedValue/=1000, originalValue=pre-fix, correctedBy='audit-unit-fix',
//      note 'AUDIT_UNIT_FIX: ...'
//   B) quarantine: validationStatus='NEEDS_REVIEW', note 'AUDIT_QUARANTINE: ...'
// Rule (within curated corrupt reports): |v| >= 5x saneAssets, OR cash-like > 1.2x saneAssets,
// OR equity-like > 0.8x saneAssets, OR flow-like > 2x saneAssets; AND |v|/1000 <= 1.2x saneAssets.
// Scale-free codes (EPS/BVPS/shares/ratios/prices) are never scaled.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const EXECUTE = process.argv.includes('--execute')

const TICKERS = ['UBEE', 'HDBK', 'NBKE', 'EXPA', 'GSSC', 'MAAL', 'VLMRA', 'CCAP', 'UPMS', 'ROTO']
const companies = await db.company.findMany({ where: { ticker: { in: TICKERS } }, select: { id: true, ticker: true } })
const byId = new Map(companies.map(c => [c.id, c.ticker]))

// --- sane asset scale per company (median of TOTAL_ASSETS within 5x of min positive)
function median(arr) { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }

const SCALE_FREE = /EPS|BOOK_VALUE|SHARE|_RATIO|DIVIDEND_PER|PRICE/
const CASH_LIKE = new Set(['CASH_AND_EQUIVALENTS', 'CLOSING_CASH', 'OPENING_CASH'])
const EQUITY_LIKE = new Set(['TOTAL_EQUITY', 'EQUITY_PARENT', 'NON_CONTROLLING_INTERESTS', 'RETAINED_EARNINGS'])
const FLOW_LIKE = new Set(['REVENUE', 'TOTAL_REVENUE', 'NET_PROFIT', 'NET_PROFIT_PARENT', 'GROSS_PROFIT', 'OPERATING_INCOME', 'EBIT', 'EBITDA', 'OPERATING_CASH_FLOW', 'FREE_CASH_FLOW', 'COGS', 'PROFIT_BEFORE_TAX', 'INCOME_TAX', 'INTEREST_EXPENSE', 'NET_INTEREST_INCOME', 'OPERATING_EXPENSES_TOTAL', 'ADMIN_EXPENSES', 'INVESTING_CASH_FLOW', 'FINANCING_CASH_FLOW', 'WORKING_CAPITAL', 'FX_EFFECT_CASH'])

// corrupt-report predicates per ticker: (report) => bool — /1000 rule applies inside
const corruptReports = {
  UBEE: () => false,
  HDBK: () => false,
  VLMRA: () => false,
  NBKE: () => false,
  EXPA: r => (r.sourceName.includes('ASKBORA_SUMMARY') && (r.fiscalYear === 2020 || r.fiscalYear === 2021) && r.periodType === 'ANNUAL')
    || (r.sourceName === 'EXCEL_STATEMENTS' && r.fiscalYear >= 2015 && r.fiscalYear <= 2019),
  GSSC: r => (r.sourceName.includes('YAHOO') && (r.fiscalYear === 2024 || r.fiscalYear === 2025) && r.periodType === 'ANNUAL')
    || (r.sourceName.includes('ASKBORA_SUMMARY') && r.periodLabel === 'Q4 2025'),
  MAAL: r => r.sourceName.includes('YAHOO') && (r.fiscalYear === 2021 || r.fiscalYear === 2022 || r.fiscalYear === 2023) && r.periodType === 'ANNUAL',
}

// curated quarantines: {ticker, fiscalYear, periodLabel, sourceIncludes, codes, minAbs?, maxAbs?, labelStarts?}
const Q = [
  // UBEE: DERIVED net-profit rows derived from mixed-scale inputs + one DERIVED BS line
  { ticker: 'UBEE', fiscalYear: { in: [2024, 2025] }, sourceIncludes: 'ASKBORA', labelStarts: 'DERIVED', codes: ['NET_PROFIT', 'TOTAL_EQUITY_AND_LIABILITIES'], note: 'derived by subtracting mixed-scale inputs (one input stored x1000) — result is arithmetic garbage; awaiting clean re-derivation after unit fixes.' },
  // NBKE: TradingView 2020-2021 bank NP/REVENUE rows — magnitude matches no sane scale (Q1-21 NP 35.16B vs FY NP 1.44B; /1000 also absurd)
  { ticker: 'NBKE', fiscalYear: { in: [2020, 2021] }, sourceIncludes: 'TRADINGVIEW', codes: ['NET_PROFIT', 'REVENUE'], note: 'TradingView 2020-21 rows for this bank match no sane scale (Q4-20 NP 9.74B vs FY2020 NP 1.44B; /1000 also absurd) — mis-mapped/wrong-definition source data; awaiting re-extraction.' },
  // HDBK: TradingView Q1-2021 NP/REVENUE — same signature
  { ticker: 'HDBK', fiscalYear: 2021, sourceIncludes: 'TRADINGVIEW', codes: ['NET_PROFIT', 'REVENUE'], note: 'TradingView Q1-2021 rows match no sane scale (NP 11.69B vs FY2021 NP 2.02B; /1000 also absurd) — mis-mapped source data; awaiting re-extraction.' },
  // EXPA: TradingView 2020-2021 REVENUE — inconsistent with annual (quarterly 8-11T vs FY 2.48T) even after /1000 (8-11B quarterly vs 2.5B annual)
  { ticker: 'EXPA', fiscalYear: { in: [2020, 2021] }, sourceIncludes: 'TRADINGVIEW', codes: ['REVENUE'], note: 'TradingView 2020-21 bank revenue rows are internally inconsistent (quarterly 8-11B > FY 2.48B even after de-scaling) — wrong-definition source data; awaiting re-extraction.' },
  // VLMRA: ALL TradingView P&L rows — entity mis-map (revenue 5-6B per quarter on 1.5B assets)
  { ticker: 'VLMRA', fiscalYear: { gte: 2024 }, sourceIncludes: 'TRADINGVIEW', codes: ['REVENUE', 'COGS', 'GROSS_PROFIT', 'OPERATING_INCOME', 'PROFIT_BEFORE_TAX', 'EBITDA'], note: 'TradingView P&L rows belong to no sane scale for this holding (quarterly revenue 5-9B on 1.5B assets — entity mis-map); balance-sheet rows kept (consistent with AskBorsa). Awaiting re-extraction.' },
  // GSSC: annual EBITDA/GP copies planted into quarterly reports + AskBorsa Q4-tab GP garbage
  { ticker: 'GSSC', exactValues: [[426867885920, 0.01], [363185381000, 0.01], [389547885, 0.02], [711000000, 0.01], [343000000, 0.01], [680000000, 0.01], [616000000, 0.01]], codes: ['EBITDA', 'GROSS_PROFIT'], note: 'annual EBITDA/GP copied into quarterly reports (same value repeats across quarters) or AskBorsa Q4-tab GP inconsistent with FY gross profit; awaiting clean quarterly re-extraction.' },
  // MAAL: annual revenue copied into TradingView quarterlies (+x1000), annual GP copy x1000 into all 2022 quarters, two broken tiny Yahoo values
  { ticker: 'MAAL', exactValues: [[546782259000, 0.01], [466937502000, 0.01], [74145423000, 0.01], [925.68, 0.02], [9.618, 0.05]], codes: ['REVENUE', 'GROSS_PROFIT', 'ACCOUNTS_RECEIVABLE', 'LONG_TERM_DEBT'], note: 'FY annual revenue/GP copied into quarterly reports (same value repeats) or broken Yahoo micro-values (AR 925.68 EGP, LTD 9.618 EGP); awaiting re-extraction.' },
  // CCAP: Q2-26 GP and FY2022 EBITDA match no sane scale in either direction
  { ticker: 'CCAP', exactValues: [[33730000000, 0.01], [29122777000, 0.01]], codes: ['GROSS_PROFIT', 'EBITDA'], note: 'GP/EBITDA match no sane scale (Q2-26 GP 33.7B on ~10B quarterly revenue; FY22 EBITDA 29.1B vs ~4B revenue; /1000 also absurd) — awaiting re-extraction.' },
  // UPMS: quarterly GP/NP far beyond the company scale in both directions
  { ticker: 'UPMS', exactValues: [[158000000, 0.01], [-222000000, 0.01]], codes: ['GROSS_PROFIT', 'NET_PROFIT'], note: 'quarterly GP 158M / NP -222M on 117M assets is impossible in any scale (/1000 also absurd) — mis-mapped or wrong-aggregation source data; awaiting re-extraction.' },
  // ROTO: Q3-2022 OCF 889M on 797M assets impossible
  { ticker: 'ROTO', exactValues: [[889000000, 0.01]], codes: ['OPERATING_CASH_FLOW'], note: 'Q3-2022 operating cash flow 889M on 797M total assets is impossible in any scale; awaiting re-extraction.' },
]

const spec = Object.fromEntries(TICKERS.map(t => [t, { t }]))

// curated /1000 fixes (evidence-verified values; exact value match ±0.5)
const FIX = [
  { ticker: 'UBEE', fiscalYear: 2026, periodLabel: 'Q1 2026', sourceIncludes: 'ASKBORA', codes: { NET_PROFIT: 611000000000 } },
  { ticker: 'UBEE', fiscalYear: 2025, periodLabel: 'Q1 2025', sourceIncludes: 'ASKBORA', codes: { NET_PROFIT: 774000000000 } },
  { ticker: 'UBEE', fiscalYear: 2025, periodLabel: 'FY 2025', sourceIncludes: 'MUBASHER', codes: { NET_PROFIT: 1792931000000 } },
  { ticker: 'UBEE', fiscalYear: 2024, periodLabel: 'Q1 2024', sourceIncludes: 'ASKBORA', codes: { NET_PROFIT: 463000000000 } },
  { ticker: 'HDBK', fiscalYear: 2021, periodLabel: 'Q2 2021', sourceIncludes: 'ASKBORA', codes: { NET_PROFIT: 349000000000 } },
  { ticker: 'HDBK', fiscalYear: 2021, periodLabel: 'Q3 2021', sourceIncludes: 'ASKBORA', codes: { NET_PROFIT: 574000000000 } },
  { ticker: 'HDBK', fiscalYear: 2021, periodLabel: 'Q4 2021', sourceIncludes: 'ASKBORA', codes: { NET_PROFIT: 444000000000 } },
  { ticker: 'NBKE', fiscalYear: 2022, periodLabel: 'FY 2022', sourceIncludes: 'EXCEL', codes: { OPERATING_CASH_FLOW: 595561750410 } },
  { ticker: 'NBKE', fiscalYear: 2023, periodLabel: 'FY 2023', sourceIncludes: 'ASKBORA', codes: { OPERATING_CASH_FLOW: -1580000000000 } },
  { ticker: 'NBKE', fiscalYear: 2021, periodLabel: 'Q4 2021', sourceIncludes: 'ASKBORA', codes: { NET_PROFIT: 388000000000, OPERATING_CASH_FLOW: 2130000000000 } },
  { ticker: 'NBKE', fiscalYear: 2021, periodLabel: 'Q3 2021', sourceIncludes: 'ASKBORA', codes: { NET_PROFIT: 356000000000, OPERATING_CASH_FLOW: 577000000000 } },
  { ticker: 'NBKE', fiscalYear: 2021, periodLabel: 'Q2 2021', sourceIncludes: 'ASKBORA', codes: { NET_PROFIT: 290000000000, OPERATING_CASH_FLOW: 1020000000000 } },
  { ticker: 'NBKE', fiscalYear: 2022, periodLabel: 'Q1 2022', sourceIncludes: 'ASKBORA', codes: { NET_PROFIT: 349000000000, OPERATING_CASH_FLOW: 662000000000 } },
  { ticker: 'NBKE', fiscalYear: 2020, periodLabel: 'Q3 2020', sourceIncludes: 'TRADINGVIEW', codes: { OPERATING_CASH_FLOW: 469000000000 } },
]

// --- collect reports + sane scales
const reports = await db.financialReport.findMany({
  where: { companyId: { in: companies.map(c => c.id) }, deletedAt: null },
  select: { id: true, companyId: true, fiscalYear: true, periodLabel: true, periodType: true, sourceName: true, values: { select: { id: true, metricCode: true, normalizedValue: true, unit: true, originalLabel: true, validationStatus: true, validationNotes: true, correctedBy: true } } },
})
const assetsByCompany = new Map()
for (const r of reports) {
  const t = byId.get(r.companyId)
  for (const v of r.values) {
    if (t && v.metricCode === 'TOTAL_ASSETS' && v.normalizedValue && v.validationStatus === 'VALID' && !(v.validationNotes ?? '').startsWith('AUDIT_QUARANTINE')) {
      if (!assetsByCompany.has(t)) assetsByCompany.set(t, [])
      assetsByCompany.get(t).push(Number(v.normalizedValue))
    }
  }
}
const saneAssets = new Map()
for (const [t, vals] of assetsByCompany) {
  const min = Math.min(...vals.filter(v => v > 0))
  saneAssets.set(t, median(vals.filter(v => v <= 5 * min)))
}

// --- build ops
const ops = []
const qTouched = new Set()
for (const r of reports) {
  const t = byId.get(r.companyId)
  if (!t) continue
  const scale = saneAssets.get(t) ?? 0
  for (const v of r.values) {
    if (v.normalizedValue === null) continue
    if ((v.validationNotes ?? '').startsWith('AUDIT_QUARANTINE') || (v.validationNotes ?? '').startsWith('AUDIT_UNIT_FIX')) continue
    if (v.validationStatus === 'FAILED') continue
    const val = Number(v.normalizedValue)
    let qHit = null
    for (const rule of Q) {
      if (rule.ticker !== t) continue
      if (rule.fiscalYear && !(typeof rule.fiscalYear === 'object' ? (rule.fiscalYear.in ? rule.fiscalYear.in.includes(r.fiscalYear) : r.fiscalYear >= (rule.fiscalYear.gte ?? -Infinity)) : r.fiscalYear === rule.fiscalYear)) continue
      if (rule.sourceIncludes && !r.sourceName.includes(rule.sourceIncludes)) continue
      if (rule.codes && !rule.codes.includes(v.metricCode)) continue
      if (rule.labelStarts && !(v.originalLabel ?? '').startsWith(rule.labelStarts)) continue
      if (rule.exactValues && !rule.exactValues.some(([ev]) => Math.abs(Math.abs(val) - Math.abs(ev)) <= 0.5)) continue
      qHit = rule
      break
    }
    if (qHit) { ops.push({ op: 'QUARANTINE', id: v.id, t, report: `FY${r.fiscalYear} ${r.periodLabel}`, src: r.sourceName.slice(0, 26), code: v.metricCode, val, note: qHit.note }); qTouched.add(v.id); continue }
    // curated /1000 fixes
    const curFix = FIX.find(f => f.ticker === t && f.fiscalYear === r.fiscalYear && f.periodLabel === r.periodLabel && r.sourceName.includes(f.sourceIncludes) && f.codes[v.metricCode] !== undefined && Math.abs(Math.abs(val) - Math.abs(f.codes[v.metricCode])) <= 0.5)
    if (curFix) { ops.push({ op: 'FIX_1000', id: v.id, t, report: `FY${r.fiscalYear} ${r.periodLabel}`, src: r.sourceName.slice(0, 26), code: v.metricCode, val, fixed: val / 1000 }); continue }
    // /1000 rule inside curated corrupt reports
    const corrupt = corruptReports[t]?.(r)
    if (!corrupt || SCALE_FREE.test(v.metricCode) || !scale) continue
    const big5 = Math.abs(val) >= 5 * scale
    const cashBad = CASH_LIKE.has(v.metricCode) && Math.abs(val) > 1.2 * scale
    const eqBad = EQUITY_LIKE.has(v.metricCode) && Math.abs(val) > 0.8 * scale
    const flowBad = FLOW_LIKE.has(v.metricCode) && Math.abs(val) > 2 * scale
    if (!(big5 || cashBad || eqBad || flowBad)) continue
    const fixed = val / 1000
    if (Math.abs(fixed) > 1.6 * scale) { ops.push({ op: 'QUARANTINE', id: v.id, t, report: `FY${r.fiscalYear} ${r.periodLabel}`, src: r.sourceName.slice(0, 26), code: v.metricCode, val, note: 'x1000-family value whose /1000 still exceeds sane scale — unresolvable; awaiting re-extraction.' }); qTouched.add(v.id); continue }
    ops.push({ op: 'FIX_1000', id: v.id, t, report: `FY${r.fiscalYear} ${r.periodLabel}`, src: r.sourceName.slice(0, 26), code: v.metricCode, val, fixed })
  }
}

// --- summary
const byTicker = new Map()
for (const o of ops) { if (!byTicker.has(o.t)) byTicker.set(o.t, { FIX_1000: 0, QUARANTINE: 0 }); byTicker.get(o.t)[o.op]++ }
console.log(JSON.stringify({ mode: EXECUTE ? 'EXECUTE' : 'DRY', saneAssets: Object.fromEntries([...saneAssets].map(([t, v]) => [t, Math.round(v)])), opsByTicker: Object.fromEntries(byTicker), total: ops.length }))
for (const o of ops) console.log(`  ${o.op.padEnd(10)} ${o.t.padEnd(5)} ${o.report.padEnd(11)} ${o.src.padEnd(26)} ${o.code.padEnd(30)} ${o.val.toLocaleString()}${o.fixed !== undefined ? ' -> ' + o.fixed.toLocaleString() : ''}`)

if (EXECUTE) {
  let fixed = 0, quarantined = 0
  const fixOps = ops.filter(o => o.op === 'FIX_1000')
  const qOps = ops.filter(o => o.op === 'QUARANTINE')
  for (let i = 0; i < fixOps.length; i += 150) {
    await Promise.all(fixOps.slice(i, i + 150).map(o => db.financialValue.update({
      where: { id: o.id },
      data: {
        normalizedValue: o.fixed,
        originalValue: o.val,
        correctedBy: 'audit-unit-fix',
        validationNotes: `AUDIT_UNIT_FIX: value stored x1000 (source printed EGP thousands, normalized as absolute EGP) — /1000 restores sane scale vs company balance sheet (${o.val.toLocaleString()} -> ${o.fixed.toLocaleString()}).`,
      },
    })))
    fixed += Math.min(150, fixOps.length - i)
  }
  for (let i = 0; i < qOps.length; i += 400) {
    await Promise.all(qOps.slice(i, i + 400).map(o => db.financialValue.update({
      where: { id: o.id },
      data: { validationStatus: 'NEEDS_REVIEW', validationNotes: `AUDIT_QUARANTINE: x1000 scale family — ${o.note}` },
    })))
    quarantined += Math.min(400, qOps.length - i)
  }
  console.log('fixed:', fixed, 'quarantined:', quarantined)
}
await db.$disconnect()
