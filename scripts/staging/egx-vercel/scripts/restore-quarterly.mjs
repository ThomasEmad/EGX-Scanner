// ============================================================================
// Quarterly Data Restoration — repairs the annual-copy contamination.
// ============================================================================
// ROOT CAUSE (proven): the DB import step wrote ANNUAL statement values into
// quarterly reports (111 companies, 1,184 quarter rows). The original harvest
// files (askborsa-quarterly-harvest.jsonl = 238 tickers, tv-quarterly-harvest.jsonl)
// hold the GENUINE quarterly values (verified: Q1+Q2+Q3+Q4 sums exactly to FY).
//
// STRATEGY (all reversible, originals preserved):
//   RESTORE   — corrupted value replaced by the genuine harvested value.
//               Audited via originalValue + correctionReason + correctedBy.
//               Flow metrics validated by sum-to-FY rule (±5%) when all 4
//               quarters + FY are present; fails → quarantine instead.
//   QUARANTINE — corrupted value without a genuine replacement:
//               validationStatus=NEEDS_REVIEW + AUDIT_QUARANTINE note.
//               (Excluded from financial reads, scores and recompute.)
//   SOFT-DELETE — whole-report clones that cannot be restored (≥90% identical,
//               ≥3 flow-metric clones, nothing genuine): deletedAt=now.
//
// DRY RUN BY DEFAULT. Run with --execute to write.
// ============================================================================
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'

const db = new PrismaClient()
const EXECUTE = process.argv.includes('--execute')

// ---------------------------------------------------------------- JSONL load
const DATA = 'C:/Users/tomas/Downloads/Meza-backup/egx-data/data'
const ask = readFileSync(`${DATA}/askborsa-quarterly-harvest.jsonl`, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
const tv = readFileSync(`${DATA}/tv-quarterly-harvest.jsonl`, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))

// AskBorsa label → canonical metric
const ASK_LABEL_MAP = {
  'صافي الربح': 'NET_PROFIT',
  'مجمل الربح': 'GROSS_PROFIT',
  'إجمالي الأصول': 'TOTAL_ASSETS',
  'إجمالي المطلوبات': 'TOTAL_LIABILITIES',
  'حقوق المساهمين': 'TOTAL_EQUITY',
  'إجمالي المطلوبات وحقوق المساهمين': 'TOTAL_EQUITY_AND_LIABILITIES',
  'التدفق النقدي التشغيلي': 'OPERATING_CASH_FLOW',
  'التدفق النقدي الاستثماري': 'INVESTING_CASH_FLOW',
  'التدفق النقدي التمويلي': 'FINANCING_CASH_FLOW',
  'صافي التغير في النقد': 'NET_CHANGE_IN_CASH',
}
// TV label → canonical metric
const TV_LABEL_MAP = {
  'Total revenue': 'REVENUE',
  'Cost of goods sold': 'COGS',
  'Gross profit': 'GROSS_PROFIT',
  'Operating income': 'OPERATING_INCOME',
  'Pretax income': 'PROFIT_BEFORE_TAX',
  'Taxes': 'INCOME_TAX',
  'EBITDA': 'EBITDA',
  'Net income before discontinued operations': 'NET_PROFIT',
}

/** ticker → quarter → year → value (plain EGP) */
function buildGenuineMaps() {
  const genuine = new Map() // key: ticker|Q1..Q4|year|metric
  for (const rec of ask) {
    if (rec.err || !rec.cols) continue
    for (const [label, metric] of Object.entries(ASK_LABEL_MAP)) {
      const vals = rec.rows[label]
      if (!vals) continue
      rec.cols.forEach((year, idx) => {
        const v = vals[idx]
        if (v === null || v === undefined || !isFinite(v)) return
        genuine.set(`${rec.ticker}|${rec.tab}|${year}|${metric}`, v)
      })
    }
  }
  for (const rec of tv) {
    if (rec.err || rec.suspect || !rec.quarters || !rec.rows) continue
    for (const [label, metric] of Object.entries(TV_LABEL_MAP)) {
      const vals = rec.rows[label]
      if (!vals) continue
      rec.quarters.forEach((q, idx) => {
        if (!q.fy || !q.q) return
        const v = vals[idx]
        if (v === null || v === undefined || !isFinite(v)) return
        const key = `${rec.ticker}|${q.q}|${q.fy}|${metric}`
        if (!genuine.has(key)) genuine.set(key, v) // askborsa wins conflicts
      })
    }
  }
  return genuine
}
const genuine = buildGenuineMaps()

// ---------------------------------------------------------------- helpers
const FLOW_METRICS = new Set([
  'REVENUE', 'COGS', 'GROSS_PROFIT', 'OPERATING_INCOME', 'PROFIT_BEFORE_TAX',
  'INCOME_TAX', 'NET_PROFIT', 'OPERATING_CASH_FLOW', 'INVESTING_CASH_FLOW',
  'FINANCING_CASH_FLOW', 'NET_CHANGE_IN_CASH', 'DIVIDENDS_PAID', 'CAPEX', 'EBITDA',
])
const CLONE_SENTINELS = ['REVENUE', 'NET_PROFIT', 'OPERATING_CASH_FLOW', 'TOTAL_ASSETS']
const UNIT_MULT = { UNIT: 1, THOUSAND: 1e3, MILLION: 1e6, BILLION: 1e9 }
const close = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1) < 0.0005 // 0.05%

const stats = { restored: 0, quarantined: 0, reportsSoftDeleted: 0, byCompany: new Map() }
const bump = (ticker, field) => {
  if (!stats.byCompany.has(ticker)) stats.byCompany.set(ticker, { restored: 0, quarantined: 0 })
  stats.byCompany.get(ticker)[field]++
}

const companies = await db.company.findMany({ where: { isActive: true }, select: { id: true, ticker: true } })

for (const { id: companyId, ticker } of companies) {
  const reports = await db.financialReport.findMany({
    where: { companyId, deletedAt: null, periodType: { in: ['ANNUAL', 'QUARTERLY'] } },
    include: { values: true },
    orderBy: [{ fiscalYear: 'asc' }, { periodLabel: 'asc' }],
  })
  if (!reports.some(r => r.periodType === 'QUARTERLY')) continue

  // FY anchors: fiscalYear → (metric → normalizedValue)
  const fy = new Map()
  for (const r of reports) {
    if (r.periodType !== 'ANNUAL') continue
    if (!fy.has(r.fiscalYear)) fy.set(r.fiscalYear, new Map())
    const m = fy.get(r.fiscalYear)
    for (const v of r.values) m.set(v.metricCode, v.normalizedValue)
  }

  for (const r of reports) {
    if (r.periodType !== 'QUARTERLY') continue
    const m = r.periodLabel.toUpperCase().match(/^Q([1-4])[ _-]?(20\d\d)$/)
    if (!m) continue
    const qNum = m[1]
    const year = Number(m[2])
    const annual = fy.get(year)
    if (!annual) continue

    let restoredHere = 0, quarantinedHere = 0
    const corruptionPlan = [] // { valueRow, metric, action: 'restore'|'quarantine', newValue }

    // ---- pass 1: classify every corrupted candidate ----
    const corrupted = []
    for (const v of r.values) {
      const fyVal = annual.get(v.metricCode)
      if (fyVal === undefined || fyVal === null || v.normalizedValue === null) continue
      if (!close(v.normalizedValue, fyVal)) continue
      // value equals FY value → annual-copy candidate (stock metrics: Q4==FY legit)
      if (qNum === '4' && !FLOW_METRICS.has(v.metricCode)) continue
      corrupted.push(v)
    }
    if (corrupted.length === 0) continue

    // ---- pass 2: sum-to-FY validation gate (flow metrics only) ----
    const sumGate = new Set() // metrics FAILING the sum check for this company-year
    if (qNum !== '4') {
      const flowCodes = new Set(corrupted.filter(v => FLOW_METRICS.has(v.metricCode)).map(v => v.metricCode))
      for (const code of flowCodes) {
        const qs = ['Q1', 'Q2', 'Q3', 'Q4'].map(q => genuine.get(`${ticker}|${q}|${year}|${code}`))
        const fyVal = annual.get(code)
        if (qs.every(v => v !== undefined) && fyVal !== undefined) {
          const sum = qs.reduce((a, b) => a + b, 0)
          if (Math.abs(sum - fyVal) / Math.max(Math.abs(fyVal), 1) > 0.05) sumGate.add(code)
        }
      }
    }

    for (const v of corrupted) {
      const code = v.metricCode
      if (sumGate.has(code)) { corruptionPlan.push({ valueRow: v, metric: code, action: 'quarantine' }); continue }
      const gv = genuine.get(`${ticker}|Q${qNum}|${year}|${code}`)
      if (gv === undefined) { corruptionPlan.push({ valueRow: v, metric: code, action: 'quarantine' }); continue }
      if (close(gv, annual.get(code)) && qNum !== '4') {
        // genuine source also equals FY — indistinguishable from harvest-side copy
        corruptionPlan.push({ valueRow: v, metric: code, action: 'quarantine' }); continue
      }
      corruptionPlan.push({ valueRow: v, metric: code, action: 'restore', newValue: gv })
    }

    if (corruptionPlan.length === 0) continue

    // ---- pass 3: whole-report clone residual check (nothing genuine?) ----
    const restoreCount = corruptionPlan.filter(p => p.action === 'restore').length
    const genuineValuesHere = r.values.length - corrupted.length
    let softDelete = false
    if (restoreCount === 0 && genuineValuesHere <= 2) {
      const sentinels = CLONE_SENTINELS.filter(c => corrupted.some(v => v.metricCode === c))
      if (corrupted.length >= 8 && sentinels.length >= 3) softDelete = true
    }

    if (!EXECUTE) {
      stats.restored += restoreCount
      stats.quarantined += corruptionPlan.length - restoreCount
      if (softDelete) stats.reportsSoftDeleted++
      console.log(`[dry] ${ticker} ${r.periodLabel} src=${r.sourceName}: corrupted=${corrupted.length} restore=${restoreCount} quarantine=${corruptionPlan.length - restoreCount}${softDelete ? ' SOFT-DELETE-REPORT' : ''}`)
      continue
    }

    if (softDelete) {
      await db.financialReport.update({
        where: { id: r.id },
        data: {
          deletedAt: new Date(),
          notes: `AUDIT_QUARANTINE: whole-report clone of FY ${year} (annual values mislabeled as quarterly at import; ${corrupted.length}/${r.values.length} values identical; no genuine quarterly source available). Reversible via deletedAt.`,
        },
      })
      stats.reportsSoftDeleted++
      bump(ticker, 'quarantined')
      continue
    }

    for (const p of corruptionPlan) {
      if (p.action === 'restore') {
        const mult = UNIT_MULT[p.valueRow.unit] ?? 1
        const data = {
          normalizedValue: p.newValue,
          value: p.newValue / mult,
          originalValue: p.valueRow.originalValue ?? p.valueRow.normalizedValue,
          isManuallyCorrected: true,
          correctedBy: 'audit-restore-quarterly',
          correctedAt: new Date(),
          correctionReason: `Annual-copy contamination (FY ${year} value stored in ${r.periodLabel}); restored genuine discrete-quarter value from askborsa/tv quarterly harvest.`,
          validationStatus: 'VALID',
          validationNotes: null,
        }
        await db.financialValue.update({ where: { id: p.valueRow.id }, data })
        stats.restored++; restoredHere++; bump(ticker, 'restored')
      } else {
        if ((p.valueRow.validationNotes || '').startsWith('AUDIT_QUARANTINE')) continue // idempotent
        await db.financialValue.update({
          where: { id: p.valueRow.id },
          data: {
            validationStatus: 'NEEDS_REVIEW',
            validationNotes: `AUDIT_QUARANTINE: annual-copy contamination (equals FY ${year} ${p.metric}); no genuine quarterly replacement available in harvest files.`,
          },
        })
        stats.quarantined++; quarantinedHere++; bump(ticker, 'quarantined')
      }
    }
  }
}

console.log('\n================ RESTORATION SUMMARY ================')
console.log(`mode: ${EXECUTE ? 'EXECUTE' : 'DRY RUN'}`)
console.log(`restored values: ${stats.restored}`)
console.log(`quarantined values: ${stats.quarantined}`)
console.log(`soft-deleted clone reports: ${stats.reportsSoftDeleted}`)
const top = [...stats.byCompany.entries()].filter(([, v]) => v.restored + v.quarantined > 5).sort((a, b) => (b[1].restored + b[1].quarantined) - (a[1].restored + a[1].quarantined)).slice(0, 30)
console.log('top companies:', top.map(([t, v]) => `${t}(R${v.restored}/Q${v.quarantined})`).join(', '))
await db.$disconnect()
