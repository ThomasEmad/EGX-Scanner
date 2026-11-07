// Verify bulk peer-gather equivalence vs the original per-peer loop.
import fs from 'node:fs'
const U = fs.readFileSync('/home/z/my-project/scripts/.turso_url','utf8').trim()
const T = fs.readFileSync('/home/z/my-project/scripts/.turso_token','utf8').trim()
const { PrismaClient } = await import('@prisma/client')
const { PrismaLibSQL } = await import('@prisma/adapter-libsql')
const db = new PrismaClient({ adapter: new PrismaLibSQL({ url: U, authToken: T }), log: [] })
const TRUSTED = ["VALIDATED", "APPROVED", "EXTRACTED"]

function metricMapFromRows(rows) { const o = {}; for (const r of rows) o[r.code.toUpperCase()] = r.value; return o }
function derivedRatiosFromValues(vals) {
  const v = {}; for (const x of vals) v[x.metricCode.toUpperCase()] = x.normalizedValue
  const o = {}
  const ca = v.CURRENT_ASSETS ?? null, inv = v.INVENTORY ?? null, cl = v.CURRENT_LIABILITIES ?? null
  if (ca !== null && cl !== null && cl !== 0) o.QUICK_RATIO = Math.max(0, (ca - (inv ?? 0)) / cl)
  const opInc = v.OPERATING_INCOME ?? v.EBIT ?? null, intExp = v.INTEREST_EXPENSE ?? null
  if (opInc !== null && intExp !== null && intExp > 0) o.INTEREST_COVERAGE = opInc / intExp
  const rev = v.REVENUE ?? null, ta = v.TOTAL_ASSETS ?? null
  if (rev !== null && ta !== null && ta !== 0) o.ASSET_TURNOVER = rev / ta
  return o
}
async function metricMapForYear(cid, fy) {
  const rows = await db.calculatedMetric.findMany({ where: { companyId: cid, fiscalYear: fy, valueStatus: "OK", statementType: "CONSOLIDATED", periodType: "ANNUAL" }, select: { code: true, value: true } })
  return metricMapFromRows(rows)
}
async function derivedRatios(cid, fy) {
  const rep = await db.financialReport.findFirst({ where: { companyId: cid, periodType: "ANNUAL", fiscalYear: fy, statementType: "CONSOLIDATED", processingStatus: { in: TRUSTED } }, orderBy: { version: "desc" }, select: { id: true } })
  if (!rep) return {}
  const vals = await db.financialValue.findMany({ where: { reportId: rep.id, validationStatus: "VALID" }, select: { metricCode: true, normalizedValue: true } })
  return derivedRatiosFromValues(vals)
}

// pick a real company with a big sector
const co = await db.company.findFirst({ where: { ticker: 'COMI' }, select: { id: true, sector: true } })
const peers = await db.company.findMany({ where: { sector: co.sector, isActive: true, id: { not: co.id } }, select: { id: true, ticker: true } })
const cand = peers.slice(0, 12)
console.log(`sector "${co.sector}": testing ${cand.length} peers`)

// --- OLD loop ---
const t0 = Date.now()
const oldMaps = new Map()
for (const p of cand) {
  const pRep = await db.financialReport.findFirst({ where: { companyId: p.id, periodType: "ANNUAL", processingStatus: { in: TRUSTED } }, orderBy: { fiscalYear: "desc" }, select: { fiscalYear: true } })
  if (!pRep) continue
  const [pcm, pdr] = await Promise.all([metricMapForYear(p.id, pRep.fiscalYear), derivedRatios(p.id, pRep.fiscalYear)])
  oldMaps.set(p.id, { ...pcm, ...pdr })
}
const oldMs = Date.now() - t0

// --- NEW bulk ---
const t1 = Date.now()
const ids = cand.map(p => p.id)
const yearGroups = await db.financialReport.groupBy({ by: ["companyId"], where: { companyId: { in: ids }, periodType: "ANNUAL", processingStatus: { in: TRUSTED } }, _max: { fiscalYear: true } })
const yearByPeer = new Map(); for (const g of yearGroups) if (g._max.fiscalYear != null) yearByPeer.set(g.companyId, g._max.fiscalYear)
const yearPairs = [...yearByPeer].map(([cid, fy]) => ({ companyId: cid, fiscalYear: fy }))
const [pcmRows, repRows] = await Promise.all([
  db.calculatedMetric.findMany({ where: { OR: yearPairs, valueStatus: "OK", statementType: "CONSOLIDATED", periodType: "ANNUAL" }, select: { companyId: true, code: true, value: true } }),
  db.financialReport.findMany({ where: { OR: yearPairs, periodType: "ANNUAL", statementType: "CONSOLIDATED", processingStatus: { in: TRUSTED } }, orderBy: [{ companyId: "asc" }, { version: "desc" }], select: { id: true, companyId: true } }),
])
const latestRepByPeer = new Map(); for (const r of repRows) if (!latestRepByPeer.has(r.companyId)) latestRepByPeer.set(r.companyId, r.id)
const valRows = latestRepByPeer.size ? await db.financialValue.findMany({ where: { reportId: { in: [...latestRepByPeer.values()] }, validationStatus: "VALID" }, select: { reportId: true, metricCode: true, normalizedValue: true } }) : []
const metricRowsByPeer = new Map(); for (const r of pcmRows) { let l = metricRowsByPeer.get(r.companyId); if (!l) metricRowsByPeer.set(r.companyId, l = []); l.push(r) }
const valsByReport = new Map(); for (const r of valRows) { let l = valsByReport.get(r.reportId); if (!l) valsByReport.set(r.reportId, l = []); l.push(r) }
const newMaps = new Map()
for (const p of cand) {
  const fy = yearByPeer.get(p.id); if (fy == null) continue
  const pcm = metricMapFromRows(metricRowsByPeer.get(p.id) ?? [])
  const repId = latestRepByPeer.get(p.id)
  const pdr = repId ? derivedRatiosFromValues(valsByReport.get(repId) ?? []) : {}
  newMaps.set(p.id, { ...pcm, ...pdr })
}
const newMs = Date.now() - t1

// compare
let bad = 0
for (const [cid, om] of oldMaps) {
  const nm = newMaps.get(cid)
  if (!nm) { bad++; console.log('MISSING peer', cid); continue }
  const keys = new Set([...Object.keys(om), ...Object.keys(nm)])
  for (const k of keys) if (om[k] !== nm[k] && !(om[k] == null && nm[k] == null)) { bad++; if (bad <= 5) console.log('DIFF', cid, k, 'old:', om[k], 'new:', nm[k]) }
}
console.log(`old: ${oldMs}ms (${oldMaps.size} peers) | new: ${newMs}ms (${newMaps.size} peers) | speedup ${(oldMs/newMs).toFixed(1)}x`)
console.log(bad === 0 ? '✅ EQUIVALENT — bulk maps identical to loop maps' : `❌ ${bad} differences`)
process.exit(0)
