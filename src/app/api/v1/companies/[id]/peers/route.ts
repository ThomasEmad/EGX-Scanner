import { db } from "@/lib/db"
import { preferConsolidatedRows, type CalcMetricRow } from "@/lib/financial/statement-pref"

// GET /api/v1/companies/[id]/peers — STRICT sector peer comparison on the
// company's own latest annual period. Peers must share the company's exact
// sector (no cross-sector fallback — comparing a bank against a real-estate
// developer is meaningless) and must be LISTED. When the sector has fewer than
// MIN_PEERS companies the response is empty with `insufficient: true` and the
// UI shows a "not enough peers" message instead of an invalid comparison.
// Metrics are sector-appropriate: banks are compared on bank-relevant ratios
// (ROE/ROA/margin/P-B) rather than generic industrial ones. Derived metrics
// come exclusively from stored CalculatedMetric rows — never recomputed ad hoc.
// Statement-type aware: per company, CONSOLIDATED rows are preferred and
// STANDALONE rows are used only when the company has no consolidated rows
// (medians are computed from the preferred basis of each peer, never mixed).

const BASE_CODES = ["roe", "net_margin", "revenue_growth", "debt_to_equity", "net_profit"] as const
const BANK_CODES = ["roe", "roa", "net_margin", "book_value_per_share", "p_b"] as const

/** Sector-appropriate comparison metrics (only stored CalculatedMetric codes) */
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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const company = await db.company.findUnique({ where: { id } })
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const sector = company.sector
  const metricCodes = metricCodesForSector(sector)

  // the company's own latest annual period anchors the comparison — every peer
  // contributes values for this exact periodKey (never a mixed-period average)
  const selfLatest = await db.calculatedMetric.findFirst({
    where: { companyId: id, periodType: "ANNUAL", code: "revenue" },
    orderBy: [{ fiscalYear: "desc" }],
    select: { fiscalYear: true, periodKey: true, periodLabel: true },
  })
  if (!selfLatest) {
    return Response.json({ sector, basis: sector, insufficient: false, period: null, medians: {}, peers: [] })
  }

  // strict same-sector peers, listed only; self included so the UI can
  // position it against the median. MIN_PEERS = 3 sector companies total.
  const MIN_PEERS = 3
  const sectorCount = await db.company.count({
    where: { sector, isActive: true, listingStatus: "LISTED" },
  })
  if (sectorCount < MIN_PEERS) {
    return Response.json({
      sector,
      basis: sector,
      insufficient: true,
      sectorCount,
      period: { key: selfLatest.periodKey, label: selfLatest.periodLabel },
      medians: {},
      peers: [],
    })
  }

  const peers = await db.company.findMany({
    where: { sector, isActive: true, listingStatus: "LISTED" },
    select: { id: true, ticker: true, nameEn: true, nameAr: true, sector: true, isDemoData: true },
    orderBy: { ticker: "asc" },
  })

  // annotation gives the Prisma payload a concrete shape (needed for generic inference)
  const metrics: Pick<CalcMetricRow, "companyId" | "code" | "value" | "valueStatus" | "statementType">[] =
    await db.calculatedMetric.findMany({
      where: {
        companyId: { in: peers.map((p) => p.id) },
        periodKey: selfLatest.periodKey,
        code: { in: [...metricCodes] },
        statementType: { in: ["CONSOLIDATED", "STANDALONE"] },
      },
      select: { companyId: true, code: true, value: true, valueStatus: true, statementType: true },
    })
  // per-company preference before any comparison/median math
  const preferredMetrics = preferConsolidatedRows(metrics)

  const byCompany = new Map<string, Record<string, number | null>>()
  for (const p of peers) byCompany.set(p.id, {})
  for (const m of preferredMetrics) {
    const row = byCompany.get(m.companyId)
    if (!row) continue
    if (m.valueStatus === "OK" && m.value !== null) row[m.code] = m.value
  }

  const medians: Record<string, number | null> = {}
  for (const code of metricCodes) {
    const vals = [...byCompany.values()].map((r) => r[code]).filter((v): v is number => v !== null && v !== undefined)
    medians[code] = median(vals)
  }

  return Response.json({
    sector,
    basis: sector,
    insufficient: false,
    sectorCount,
    period: { key: selfLatest.periodKey, label: selfLatest.periodLabel },
    medians,
    peers: peers.map((p) => ({
      ...p,
      isSelf: p.id === id,
      values: byCompany.get(p.id) ?? {},
    })),
  })
}
