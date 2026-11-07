#!/usr/bin/env python3
"""Patch gather.ts: replace the 5-queries-per-peer N+1 loop (200 sequential
round trips ≈ 26s on Turso) with 4 batched queries, and wrap the whole gather
in the SWR server cache (15 min, invalidated on pipeline recompute)."""
import io, sys, shutil

SRC = "/tmp/my-project/src/lib/analytics/gather.ts"
BAK = "/home/z/my-project/scripts/patches/gather-pre-bulk.ts.bak"

OLD_IMPORT = 'import { db } from "@/lib/db"'
NEW_IMPORT = 'import { db } from "@/lib/db"\nimport { cached } from "@/lib/server-cache"'

OLD_DERIVED = '''/** Raw-value derived ratios for one fiscal year (quick ratio, interest coverage, asset turnover). */
async function derivedRatios(companyId: string, fiscalYear: number): Promise<MetricMap> {
  const report = await db.financialReport.findFirst({
    where: { companyId, periodType: "ANNUAL", fiscalYear, statementType: "CONSOLIDATED", processingStatus: { in: TRUSTED } },
    orderBy: { version: "desc" },
    select: { id: true },
  })
  if (!report) return {}
  const vals = await db.financialValue.findMany({
    where: { reportId: report.id, validationStatus: "VALID" },
    select: { metricCode: true, normalizedValue: true },
  })
  const v: MetricMap = {}
  for (const x of vals) v[x.metricCode.toUpperCase()] = x.normalizedValue
  const out: MetricMap = {}
  const ca = v.CURRENT_ASSETS ?? null, inv = v.INVENTORY ?? null, cl = v.CURRENT_LIABILITIES ?? null
  if (ca !== null && cl !== null && cl !== 0) {
    out.QUICK_RATIO = Math.max(0, (ca - (inv ?? 0)) / cl)
  }
  const opInc = v.OPERATING_INCOME ?? v.EBIT ?? null
  const intExp = v.INTEREST_EXPENSE ?? null
  if (opInc !== null && intExp !== null && intExp > 0) {
    out.INTEREST_COVERAGE = opInc / intExp
  }
  const rev = v.REVENUE ?? null
  const ta = v.TOTAL_ASSETS ?? null
  if (rev !== null && ta !== null && ta !== 0) {
    out.ASSET_TURNOVER = rev / ta
  }
  return out
}'''

NEW_DERIVED = '''function metricMapFromRows(rows: { code: string; value: number | null }[]): MetricMap {
  const out: MetricMap = {}
  for (const r of rows) out[r.code.toUpperCase()] = r.value
  return out
}

/** Pure: derived ratios from the raw FinancialValue rows of one report. */
function derivedRatiosFromValues(vals: { metricCode: string; normalizedValue: number }[]): MetricMap {
  const v: MetricMap = {}
  for (const x of vals) v[x.metricCode.toUpperCase()] = x.normalizedValue
  const out: MetricMap = {}
  const ca = v.CURRENT_ASSETS ?? null, inv = v.INVENTORY ?? null, cl = v.CURRENT_LIABILITIES ?? null
  if (ca !== null && cl !== null && cl !== 0) {
    out.QUICK_RATIO = Math.max(0, (ca - (inv ?? 0)) / cl)
  }
  const opInc = v.OPERATING_INCOME ?? v.EBIT ?? null
  const intExp = v.INTEREST_EXPENSE ?? null
  if (opInc !== null && intExp !== null && intExp > 0) {
    out.INTEREST_COVERAGE = opInc / intExp
  }
  const rev = v.REVENUE ?? null
  const ta = v.TOTAL_ASSETS ?? null
  if (rev !== null && ta !== null && ta !== 0) {
    out.ASSET_TURNOVER = rev / ta
  }
  return out
}

/** Raw-value derived ratios for one fiscal year (quick ratio, interest coverage, asset turnover). */
async function derivedRatios(companyId: string, fiscalYear: number): Promise<MetricMap> {
  const report = await db.financialReport.findFirst({
    where: { companyId, periodType: "ANNUAL", fiscalYear, statementType: "CONSOLIDATED", processingStatus: { in: TRUSTED } },
    orderBy: { version: "desc" },
    select: { id: true },
  })
  if (!report) return {}
  const vals = await db.financialValue.findMany({
    where: { reportId: report.id, validationStatus: "VALID" },
    select: { metricCode: true, normalizedValue: true },
  })
  return derivedRatiosFromValues(vals)
}'''

OLD_PEERS = '''  // sector peers (same fiscal year) — same construction, lightweight
  const peers = await db.company.findMany({
    where: { sector: co.sector, isActive: true, id: { not: companyId } },
    select: { id: true, ticker: true },
  })
  const peerMaps: GatheredAnalytics["peers"] = []
  for (const p of peers.slice(0, 40)) {
    // each peer contributes its OWN latest fiscal year (years vary across companies)
    const pRep = await db.financialReport.findFirst({
      where: { companyId: p.id, periodType: "ANNUAL", processingStatus: { in: TRUSTED } },
      orderBy: { fiscalYear: "desc" },
      select: { fiscalYear: true },
    })
    if (!pRep) continue
    const [pcm, pdr] = await Promise.all([metricMapForYear(p.id, pRep.fiscalYear), derivedRatios(p.id, pRep.fiscalYear)])
    peerMaps.push({ id: p.id, ticker: p.ticker, latest: { ...pcm, ...pdr } })
  }'''

NEW_PEERS = '''  // sector peers (same fiscal year) — BULK construction: the previous per-peer
  // loop ran 5 sequential queries x 40 peers (~200 round trips ≈ 26s on Turso
  // — the snowflake section's multi-second load). These four batched queries
  // produce the identical maps in ~1s (2026-11-07).
  const peers = await db.company.findMany({
    where: { sector: co.sector, isActive: true, id: { not: companyId } },
    select: { id: true, ticker: true },
  })
  const peerMaps: GatheredAnalytics["peers"] = []
  const peerCandidates = peers.slice(0, 40)
  const peerIds = peerCandidates.map((p) => p.id)
  if (peerIds.length) {
    // each peer contributes its OWN latest fiscal year (years vary across companies)
    const yearGroups = await db.financialReport.groupBy({
      by: ["companyId"],
      where: { companyId: { in: peerIds }, periodType: "ANNUAL", processingStatus: { in: TRUSTED } },
      _max: { fiscalYear: true },
    })
    const yearByPeer = new Map<string, number>()
    for (const g of yearGroups) {
      if (g._max.fiscalYear != null) yearByPeer.set(g.companyId, g._max.fiscalYear)
    }
    if (yearByPeer.size) {
      const yearPairs = [...yearByPeer].map(([cid, fy]) => ({ companyId: cid, fiscalYear: fy }))
      const [pcmRows, repRows] = await Promise.all([
        db.calculatedMetric.findMany({
          where: { OR: yearPairs, valueStatus: "OK", statementType: "CONSOLIDATED", periodType: "ANNUAL" },
          select: { companyId: true, code: true, value: true },
        }),
        db.financialReport.findMany({
          where: { OR: yearPairs, periodType: "ANNUAL", statementType: "CONSOLIDATED", processingStatus: { in: TRUSTED } },
          orderBy: [{ companyId: "asc" }, { version: "desc" }],
          select: { id: true, companyId: true },
        }),
      ])
      const latestRepByPeer = new Map<string, string>()
      for (const r of repRows) {
        if (!latestRepByPeer.has(r.companyId)) latestRepByPeer.set(r.companyId, r.id)
      }
      const valRows = latestRepByPeer.size
        ? await db.financialValue.findMany({
            where: { reportId: { in: [...latestRepByPeer.values()] }, validationStatus: "VALID" },
            select: { reportId: true, metricCode: true, normalizedValue: true },
          })
        : []
      const metricRowsByPeer = new Map<string, { code: string; value: number | null }[]>()
      for (const r of pcmRows) {
        let list = metricRowsByPeer.get(r.companyId)
        if (!list) metricRowsByPeer.set(r.companyId, (list = []))
        list.push(r)
      }
      const valsByReport = new Map<string, { metricCode: string; normalizedValue: number }[]>()
      for (const r of valRows) {
        let list = valsByReport.get(r.reportId)
        if (!list) valsByReport.set(r.reportId, (list = []))
        list.push(r)
      }
      for (const p of peerCandidates) {
        const fy = yearByPeer.get(p.id)
        if (fy == null) continue
        const pcm = metricMapFromRows(metricRowsByPeer.get(p.id) ?? [])
        const repId = latestRepByPeer.get(p.id)
        const pdr = repId ? derivedRatiosFromValues(valsByReport.get(repId) ?? []) : {}
        peerMaps.push({ id: p.id, ticker: p.ticker, latest: { ...pcm, ...pdr } })
      }
    }
  }'''

OLD_ENTRY = '''export async function gatherCompanyAnalytics(companyId: string): Promise<GatheredAnalytics | null> {
  const co = await db.company.findUnique({'''
NEW_ENTRY = '''// SWR-cached per company (15 min; invalidated on pipeline recompute): the
// snowflake endpoint and the AI answer engine both call this — a cache hit
// turns both into ~0ms DB work.
export function gatherCompanyAnalytics(companyId: string): Promise<GatheredAnalytics | null> {
  return cached(`analytics:${companyId}`, 15 * 60_000, () => gatherCompanyAnalyticsUncached(companyId))
}

async function gatherCompanyAnalyticsUncached(companyId: string): Promise<GatheredAnalytics | null> {
  const co = await db.company.findUnique({'''

shutil.copy(SRC, BAK)
text = io.open(SRC, encoding="utf-8").read()
for old, new in [(OLD_IMPORT, NEW_IMPORT), (OLD_DERIVED, NEW_DERIVED), (OLD_PEERS, NEW_PEERS), (OLD_ENTRY, NEW_ENTRY)]:
    if old not in text:
        print("BLOCK NOT FOUND:", old[:60].replace("\n", "\\n")); sys.exit(1)
    text = text.replace(old, new, 1)
io.open(SRC, "w", encoding="utf-8").write(text)
print("patched OK")
