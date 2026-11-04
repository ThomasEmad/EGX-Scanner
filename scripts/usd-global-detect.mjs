// 1) Global USD-reporter detector: DB annual revenue vs AskBorsa-harvest EGP
//    revenue for the same fiscal year — ratio ~1/45-1/55 = USD stored as EGP.
// 2) VALU / FERC / IRON Yahoo report lines vs AskBorsa ground truth.
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'
const db = new PrismaClient()

const lines = readFileSync('../egx-data/data/askborsa-quarterly-harvest.jsonl', 'utf8').trim().split('\n').map(JSON.parse)
const harv = new Map() // ticker -> Map(fy -> {revenue, netProfit, assets, equity})
for (const l of lines) {
  const t = (l.ticker || '').toUpperCase()
  const rows = l.rows || {}
  const cols = l.cols || []
  // annual table = the tab named FY/'سنوي' — detect by tab field
  const rev = rows['الإيرادات'] || rows['صافي الإيرادات'] || rows['إجمالي الإيرادات']
  const np = rows['صافي الربح'] || rows['صافي الربح المخصص للمساهمين'] || rows['صافي ربح السنة']
  const eq = rows['حقوق المساهمين'] || rows['إجمالي حقوق الملكية']
  const as = rows['إجمالي الأصول']
  if (!rev && !eq && !as) continue
  // take the LAST column (most recent year) per line
  const last = arr => (arr && arr.length ? arr[arr.length - 1] : null)
  const fy = Number(cols[cols.length - 1])
  if (!Number.isFinite(fy)) continue
  const m = harv.get(t) ?? new Map()
  const prev = m.get(fy) ?? {}
  prev.revenue = prev.revenue ?? last(rev)
  prev.netProfit = prev.netProfit ?? last(np)
  prev.equity = prev.equity ?? last(eq)
  prev.assets = prev.assets ?? last(as)
  m.set(fy, prev)
  harv.set(t, m)
}

// 1) USD detector
const companies = await db.company.findMany({ where: { isActive: true }, select: { id: true, ticker: true } })
console.log('--- USD-magnitude candidates (DB annual revenue vs AskBorsa EGP, same FY):')
for (const { id, ticker } of companies) {
  const h = harv.get(ticker)
  if (!h) continue
  const reports = await db.financialReport.findMany({
    where: { companyId: id, deletedAt: null, periodType: 'ANNUAL', fiscalYear: { in: [...h.keys()] } },
    include: { values: { where: { metricCode: 'REVENUE', validationStatus: 'VALID', NOT: { validationNotes: { startsWith: 'AUDIT_QUARANTINE' } } }, select: { normalizedValue: true } } },
  })
  // report values don't carry fiscalYear — use the report's
  for (const r of reports) {
    const v = r.values[0]
    if (!v || v.normalizedValue === null) continue
    const hv = h.get(r.fiscalYear)?.revenue
    if (!hv) continue
    const ratio = Number(v.normalizedValue) / Number(hv)
    if (ratio < 0.03 && ratio > 0.005) {
      console.log(`  ${ticker} FY${r.fiscalYear}: DB=${Number(v.normalizedValue).toLocaleString()} askborsa=${Number(hv).toLocaleString()} ratio=${ratio.toFixed(4)} (~1/${(1 / ratio).toFixed(0)})`)
    }
  }
}

// 2) VALU/FERC/IRON full comparison
console.log('\n--- VALU/FERC/IRON: DB lines vs AskBorsa ground truth:')
for (const ticker of ['VALU', 'FERC', 'IRON']) {
  const c = await db.company.findUnique({ where: { ticker }, select: { id: true } })
  const reps = await db.financialReport.findMany({
    where: { companyId: c.id, deletedAt: null, periodType: 'ANNUAL' },
    orderBy: [{ fiscalYear: 'desc' }], take: 1,
    select: { fiscalYear: true, sourceName: true, values: { where: { validationStatus: 'VALID', NOT: { validationNotes: { startsWith: 'AUDIT_QUARANTINE' } } }, select: { metricCode: true, normalizedValue: true } } },
  })
  const r = reps[0]
  if (!r) continue
  const h = harv.get(ticker)
  const hv = h ? [...h.entries()].sort((a, b) => b[0] - a[0])[0] : null
  console.log(`\n${ticker} DB FY${r.fiscalYear} (${r.sourceName.slice(0, 30)}) vs AskBorsa FY${hv ? hv[0] : '?'}`)
  const dbm = Object.fromEntries(r.values.map(v => [v.metricCode, Number(v.normalizedValue)]))
  const hm = hv ? Object.fromEntries(['revenue', 'netProfit', 'assets', 'equity'].map(k => [k, hv[1][k] === undefined ? null : Number(hv[1][k])])) : {}
  const cmp = [['REVENUE', 'revenue'], ['NET_PROFIT', 'netProfit'], ['TOTAL_ASSETS', 'assets'], ['TOTAL_EQUITY', 'equity']]
  for (const [code, key] of cmp) {
    const d = dbm[code], h2 = hm[key]
    if (d === undefined && h2 == null) continue
    const ratio = d && h2 ? (d / h2).toFixed(2) : '?'
    console.log(`  ${code.padEnd(16)} DB=${d === undefined ? '-' : d.toLocaleString()} | askborsa=${h2 == null ? '-' : h2.toLocaleString()} | ratio=${ratio}`)
  }
}
await db.$disconnect()
