// CCAP (Qala) remediation — evidence: scripts/ccap-dump-utf8.out + AskBorsa harvest
// (egx-data/data/askborsa-harvest.jsonl: assets 145/161/228B, equity 22.37/39.94/67B,
// NI -2.55/-2.28/-2.29/+6.52/+6.39B, GP(total income) 3.81/6.64/35.06/26.22/13.18B).
// Findings:
//  - Yahoo/repair-engine P&L rows are a broken family (FY2024: tax 2.8B > PBT 1.05B;
//    NI -1.755B implies NCI lost 8.1B on 80.7B NCI equity) while NET_PROFIT_PARENT
//    matches AskBorsa EXACTLY (6.523B/6.391B) and EPS=NPP/1.82B shares verifies.
//  - AskBora-sourced rows are correct: assets/equity/liabilities/TEAL, cash flows,
//    quarterly GP rows (8.89+6.78+5.79-8.28=13.18B = FY2024 GP EXACT), 2021 quarterlies
//    sum to annual (-479-402-441-958 = -2.28B EXACT).
//  - EXCEL_STATEMENTS 2015-2019 block is x10 (BS identity holds only at /10:
//    3.74B assets - 1.10B equity = 2.64B liabilities EXACT) except NET_PROFIT rows
//    which are column-shift artifacts (FY2019 NP = -REVENUE/10 exactly).
//  - Copy family: same value repeated across quarters (-248.862M x4 2022, 292.063M x4
//    2023, -3.552B x4 2024, -1.249B x4 2025, quarterly equity -13.26/-7.11/-13.75/-5.71B,
//    Q4-25 GP/OCF/FIN/INV copied from Q2-25).
// Ops: /10 unit fix (Excel block, reversible AUDIT_UNIT_FIX) + quarantine (AUDIT_QUARANTINE).
// net_profit metric keeps working via NET_PROFIT_PARENT fallback added to recompute.ts.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const EXECUTE = process.argv.includes('--execute')

const ccap = await db.company.findUnique({ where: { ticker: 'CCAP' }, select: { id: true } })
const reports = await db.financialReport.findMany({
  where: { companyId: ccap.id, deletedAt: null },
  select: { id: true, fiscalYear: true, periodLabel: true, periodType: true, sourceName: true, values: { select: { id: true, metricCode: true, normalizedValue: true, validationStatus: true, validationNotes: true } } },
  orderBy: [{ fiscalYear: 'asc' }, { periodLabel: 'asc' }],
})

// AskBora-verified GROSS_PROFIT rows to KEEP (sum to the FY totals exactly)
const keepGP = new Set([
  '2024|FY 2024|13179472000', '2024|Q1 2024|8890000000', '2024|Q2 2024|6780000000',
  '2024|Q3 2024|5790000000', '2024|Q4 2024|-8280000000', '2023|Q4 2023|4850000000',
  '2021|Q1 2021|736000000', '2021|Q2 2021|1460000000', '2021|Q3 2021|1570000000', '2021|Q4 2021|2880000000',
])
// AskBora-verified NET_PROFIT rows to KEEP (annual -2.55/-2.28B match the harvest
// exactly; 2021 quarterlies sum to -2.28B exactly)
const keepNP = new Set([
  '2020|FY 2020|-2550000000', '2021|FY 2021|-2280000000',
  '2021|Q1 2021|-479000000', '2021|Q2 2021|-402000000', '2021|Q3 2021|-441000000', '2021|Q4 2021|-958000000',
])

// Yahoo-family P&L codes to quarantine in CCAP annual/quarterly reports (2020+)
const YPL = new Set(['REVENUE', 'COGS', 'EBIT', 'EBITDA', 'OPERATING_INCOME', 'PROFIT_BEFORE_TAX', 'INCOME_TAX', 'ADMIN_EXPENSES', 'INTEREST_EXPENSE', 'INTEREST_INCOME', 'NET_INTEREST_INCOME', 'DEPRECIATION_EXPENSE', 'EXTRAORDINARY_ITEMS', 'OPERATING_EXPENSES_TOTAL', 'INVENTORY', 'GROSS_PROFIT'])

const ops = []
for (const r of reports) {
  const isExcel = r.sourceName === 'EXCEL_STATEMENTS' && r.fiscalYear >= 2015 && r.fiscalYear <= 2019
  const key = `${r.fiscalYear}|${r.periodLabel}`
  for (const v of r.values) {
    if (v.normalizedValue === null) continue
    if ((v.validationNotes ?? '').startsWith('AUDIT_QUARANTINE') || (v.validationNotes ?? '').startsWith('AUDIT_UNIT_FIX')) continue
    if (v.validationStatus === 'FAILED') continue
    const val = Number(v.normalizedValue)
    let op = null, note = ''
    if (isExcel) {
      if (v.metricCode === 'NET_PROFIT') { op = 'QUARANTINE'; note = 'Refinitiv column-shift artifact (FY2019 NP = -REVENUE/10 exactly; CI Capital was dividend-paying, not loss-making x5 years) — awaiting re-extraction.' }
      else if (r.fiscalYear === 2017 && v.metricCode === 'CURRENT_ASSETS') { op = 'QUARANTINE'; note = 'column-copy artifact (CURRENT_ASSETS = TOTAL_EQUITY to the cent) — awaiting re-extraction.' }
      else { op = 'FIX_10'; note = 'EXCEL block stored x10 (BS identity 3.74-1.10=2.64B holds only at /10; matches CI Capital 2015-2019 scale).' }
    } else if (r.fiscalYear >= 2020 && r.fiscalYear <= 2025) {
      if (v.metricCode === 'NET_PROFIT' || (v.metricCode === 'NET_PROFIT_PARENT' && (Math.abs(val + 1249248000) < 1 || Math.abs(val + 3552422000) < 1 || Math.abs(val + 248862000) < 1 || Math.abs(val - 292063000) < 1))) {
        if (v.metricCode === 'NET_PROFIT_PARENT' || !keepNP.has(`${key}|${Math.round(val)}`)) {
          op = 'QUARANTINE'
          note = Math.abs(val - (-1.249248e9)) < 1 || Math.abs(val + 3552422000) < 1 || Math.abs(val + 248862000) < 1 || Math.abs(val - 292063000) < 1
            ? 'same value repeated across quarters (copy family) or contradicts NET_PROFIT_PARENT vs AskBorsa ground truth — awaiting re-extraction.'
            : 'contradicts AskBorsa ground truth (NI 2020-22 = -2.55/-2.28/-2.29B; 2024 = +6.39B) and NCI sanity — awaiting re-extraction.'
        }
      } else if (v.metricCode === 'GROSS_PROFIT') {
        if (keepGP.has(`${key}|${Math.round(val)}`)) continue
        op = 'QUARANTINE'; note = 'contradicts AskBorsa GP(total income) ground truth or a copy of another quarter — awaiting re-extraction.'
      } else if (['EQUITY_PARENT', 'NON_CONTROLLING_INTERESTS', 'RETAINED_EARNINGS'].includes(v.metricCode)) {
        op = 'QUARANTINE'; note = 'equity components do not sum to verified TOTAL_EQUITY (parent equity negative with positive attributable profits; copies across quarters) — awaiting re-extraction.'
      } else if (v.metricCode === 'TOTAL_EQUITY' && val < 0) {
        op = 'QUARANTINE'; note = 'negative total equity contradicts AskBorsa-verified positive equity (+22.37/+39.94/+67B year-ends) — repair-engine artifact; awaiting re-extraction.'
      } else if (r.periodType === 'ANNUAL' && YPL.has(v.metricCode)) {
        op = 'QUARANTINE'; note = 'Yahoo P&L family internally chainable but absurd vs balance sheet (FY2024 tax 2.8B > PBT 1.05B; revenue 44-61% asset yield) — awaiting re-extraction.'
      } else if (r.periodType === 'QUARTERLY' && YPL.has(v.metricCode) && (r.sourceName.includes('YAHOO') || r.fiscalYear === 2020 || r.fiscalYear === 2021 || (v.metricCode !== 'GROSS_PROFIT' && r.fiscalYear >= 2022))) {
        // quarterly Yahoo P&L rows (2025 copies) + non-AskBora-verified quarterly rows
        if (v.metricCode === 'GROSS_PROFIT' && (r.fiscalYear === 2022 || r.fiscalYear === 2023)) { op = 'QUARANTINE'; note = 'annual GP copied into quarterly reports — awaiting re-extraction.' }
        else if (v.metricCode === 'GROSS_PROFIT' && r.fiscalYear === 2025 && val > 0) { op = 'QUARANTINE'; note = 'Q2-2025 GP copied into later quarters — awaiting re-extraction.' }
        else if (v.metricCode !== 'GROSS_PROFIT' && r.sourceName.includes('YAHOO')) { op = 'QUARANTINE'; note = 'Yahoo P&L family garbage — awaiting re-extraction.' }
      } else if (r.periodType === 'QUARTERLY' && r.fiscalYear === 2025 && ['OPERATING_CASH_FLOW', 'FINANCING_CASH_FLOW', 'INVESTING_CASH_FLOW'].includes(v.metricCode) && (r.sourceName.includes('YAHOO') || val === 28341264000 || val === -20195829000 || val === -6018762000)) {
        op = 'QUARANTINE'; note = 'Q2-2025 cash-flow rows copied into Q3/Q4-2025 (identical values across three different quarters) — awaiting re-extraction.'
      }
    }
    if (!op) continue
    ops.push({ op, id: v.id, report: `FY${r.fiscalYear} ${r.periodLabel}`, src: r.sourceName.slice(0, 26), code: v.metricCode, val, fixed: op === 'FIX_10' ? val / 10 : undefined, note })
  }
}

const summary = {}
for (const o of ops) summary[`${o.op}`] = (summary[o.op] ?? 0) + 1
console.log(JSON.stringify({ mode: EXECUTE ? 'EXECUTE' : 'DRY', ...summary, total: ops.length }))
for (const o of ops) console.log(`  ${o.op.padEnd(9)} ${o.report.padEnd(12)} ${o.src.padEnd(26)} ${o.code.padEnd(28)} ${o.val.toLocaleString()}${o.fixed !== undefined ? ' -> ' + o.fixed.toLocaleString() : ''}`)

if (EXECUTE) {
  const fixOps = ops.filter(o => o.op === 'FIX_10')
  const qOps = ops.filter(o => o.op === 'QUARANTINE')
  for (let i = 0; i < fixOps.length; i += 150) {
    await Promise.all(fixOps.slice(i, i + 150).map(o => db.financialValue.update({
      where: { id: o.id },
      data: {
        normalizedValue: o.fixed, originalValue: o.val, correctedBy: 'audit-unit-fix',
        validationNotes: `AUDIT_UNIT_FIX: value stored x10 (Refinitiv CF-Export block; BS identity holds only at /10) (${o.val.toLocaleString()} -> ${o.fixed.toLocaleString()}).`,
      },
    })))
  }
  for (let i = 0; i < qOps.length; i += 400) {
    await Promise.all(qOps.slice(i, i + 400).map(o => db.financialValue.update({
      where: { id: o.id },
      data: { validationStatus: 'NEEDS_REVIEW', validationNotes: `AUDIT_QUARANTINE: CCAP broken-source family — ${o.note}` },
    })))
  }
  console.log('fixed:', fixOps.length, 'quarantined:', qOps.length)
}
await db.$disconnect()
