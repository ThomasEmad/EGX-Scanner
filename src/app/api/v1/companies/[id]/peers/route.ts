import { db } from "@/lib/db"
import { fetchCalcMany } from "@/lib/financial/statement-pref"
import {
  isStalePeriod,
  periodOrder,
  selectLatestByCompany,
  type PeriodRef,
} from "@/lib/financial/latest-period"

// GET /api/v1/companies/[id]/peers?basis=latest|annual|ttm
//
// STRICT sector peer comparison where every company contributes its OWN latest
// available value for each metric — not a single shared period. Companies on
// the EGX file on different calendars (some have Q2 2026, some only FY 2025);
// anchoring everyone to one period either hides the freshest data or compares a
// stale annual ROE with a current quarter.
//
// Each peer therefore carries:
//   - values[code]  latest available numeric value
//   - periods[code] the exact period that supplied it (Q2 2026, TTM ending Q1
//                   2026, FY 2025, …) so the UI can show the basis per row
//   - anchor        the freshest period among those values
// Medians are computed from the same latest-available values. A missing value
// is null — never zero, never an older period silently substituted.
//
// basis=latest (default) → freshest available period of any type
// basis=annual           → latest annual only
// basis=ttm              → latest trailing-twelve-months only
//
// Sector-appropriate metrics: banks on ROE/ROA/margin/BVPS/P-B; everyone else
// on ROE/margin/leverage/net profit. Derived metrics come exclusively from
// stored CalculatedMetric rows — never recomputed ad hoc.

const BASE_CODES = ["roe", "net_margin", "debt_to_equity", "net_profit"] as const
const BANK_CODES = ["roe", "roa", "net_margin", "book_value_per_share", "p_b"] as const

function metricCodesForSector(sector: string): readonly string[] {
  if (sector === "Banks" || sector === "Financial Services") return BANK_CODES
  return BASE_CODES
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const raw = decodeURIComponent(id)
  // CUIDs are lower-case and case-sensitive; only upper-case ticker/ISIN keys.
  const upper = raw.toUpperCase()
  const url = new URL(req.url)
  const requestedBasis = url.searchParams.get("basis")
  const basis = requestedBasis === "annual" || requestedBasis === "ttm" ? requestedBasis : "latest"

  const company = await db.company.findFirst({
    where: { OR: [{ id: raw }, { ticker: upper }, { isin: upper }] },
  })
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })
  const companyId = company.id

  const sector = company.sector
  const metricCodes = metricCodesForSector(sector)

  const MIN_PEERS = 3
  const sectorCount = await db.company.count({
    where: { sector, isActive: true, listingStatus: "LISTED" },
  })
  if (sectorCount < MIN_PEERS) {
    return Response.json({
      sector,
      basis,
      insufficient: true,
      sectorCount,
      period: null,
      medians: {},
      peers: [],
    })
  }

  const peers = await db.company.findMany({
    where: { sector, isActive: true, listingStatus: "LISTED" },
    select: { id: true, ticker: true, nameEn: true, nameAr: true, sector: true, isDemoData: true },
    orderBy: { ticker: "asc" },
  })

  // One query for every peer; fetchCalcMany applies the per-company
  // CONSOLIDATED-over-STANDALONE preference and never mixes the two.
  const { filtered } = await fetchCalcMany(
    peers.map((p) => p.id),
    { code: { in: [...metricCodes] } },
  )

  const basisRows = basis === "latest"
    ? filtered
    : filtered.filter((r) => r.periodType === (basis === "annual" ? "ANNUAL" : "TTM"))

  // ROE/ROA must be full-period (TTM or annual) even on the "latest" basis:
  // a Q1 return is not annualised and would overstate the comparison.
  const latest = selectLatestByCompany(basisRows, metricCodes, {
    fullPeriodCodes: ["roe", "roa", "roic", "roce"],
  })

  const selfLatest = latest.get(companyId)
  const allAnchors = peers
    .map((p) => latest.get(p.id)?.anchor)
    .filter((a): a is PeriodRef => Boolean(a))
  const freshestOrder = allAnchors.reduce(
    (m, a) => Math.max(m, periodOrder(a.type, a.fiscalYear, a.label)),
    0,
  )

  // Medians must not be dragged by a company whose last filing is years old
  // (ALEX FY2018 ROE −977% would otherwise dominate the Building Materials
  // median). A metric is included only when its own period is within four
  // quarters of the sector's freshest period.
  const medians: Record<string, number | null> = {}
  for (const code of metricCodes) {
    const vals = peers
      .map((p) => {
        const row = latest.get(p.id)
        const period = row?.periods[code]
        if (!period || isStalePeriod(period, freshestOrder)) return null
        return row?.values[code] ?? null
      })
      .filter((v): v is number => v !== null)
    medians[code] = median(vals)
  }

  return Response.json({
    sector,
    basis,
    insufficient: false,
    sectorCount,
    // the self company's freshest period; each peer carries its own below
    period: selfLatest?.anchor ?? null,
    medians,
    peers: peers.map((p) => {
      const row = latest.get(p.id)
      return {
        ...p,
        isSelf: p.id === companyId,
        values: row?.values ?? {},
        periods: row?.periods ?? {},
        period: row?.anchor ?? null,
        stale: isStalePeriod(row?.anchor ?? null, freshestOrder),
        // per-metric staleness: a peer can have a fresh balance sheet but a
        // years-old ROE, so the chart/table filters each metric separately.
        staleCodes: metricCodes.filter((code) => {
          const period = row?.periods[code]
          return period ? isStalePeriod(period, freshestOrder) : false
        }),
      }
    }),
  })
}
