import { db } from "@/lib/db"
import { preferConsolidatedRows, type CalcMetricRow } from "@/lib/financial/statement-pref"

// GET /api/v1/companies/[id]/peers — sector peer comparison on the latest annual
// period. Falls back to all sectors when the company's sector has fewer than 3
// listed peers (the response flags which basis was used). Derived metrics come
// exclusively from stored CalculatedMetric rows — never recomputed ad hoc.
// Statement-type aware: per company, CONSOLIDATED rows are preferred and
// STANDALONE rows are used only when the company has no consolidated rows
// (medians are computed from the preferred basis of each peer, never mixed).

const PEER_CODES = ["roe", "net_margin", "revenue_growth", "debt_to_equity", "net_profit"] as const

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

  // latest annual fiscal year in the dataset
  const latest = await db.calculatedMetric.findFirst({
    where: { periodType: "ANNUAL", code: "revenue" },
    orderBy: [{ fiscalYear: "desc" }],
    select: { fiscalYear: true, periodKey: true, periodLabel: true },
  })
  if (!latest) return Response.json({ sector: company.sector, basis: company.sector, period: null, peers: [], medians: {} })

  const sameSector = await db.company.count({ where: { sector: company.sector, isActive: true } })
  const useSectorFallback = sameSector < 3
  const where = useSectorFallback ? { isActive: true } : { sector: company.sector, isActive: true }
  const basis = useSectorFallback ? `All sectors (only ${sameSector} in ${company.sector})` : company.sector

  const peers = await db.company.findMany({
    where,
    select: { id: true, ticker: true, nameEn: true, nameAr: true, sector: true, isDemoData: true },
    orderBy: { ticker: "asc" },
  })

  // annotation gives the Prisma payload a concrete shape (needed for generic inference)
  const metrics: Pick<CalcMetricRow, "companyId" | "code" | "value" | "valueStatus" | "statementType">[] =
    await db.calculatedMetric.findMany({
      where: {
        companyId: { in: peers.map((p) => p.id) },
        periodKey: latest.periodKey,
        code: { in: [...PEER_CODES] },
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
  for (const code of PEER_CODES) {
    const vals = [...byCompany.values()].map((r) => r[code]).filter((v): v is number => v !== null && v !== undefined)
    medians[code] = median(vals)
  }

  return Response.json({
    sector: company.sector,
    basis,
    period: { key: latest.periodKey, label: latest.periodLabel },
    medians,
    peers: peers.map((p) => ({
      ...p,
      isSelf: p.id === id,
      values: byCompany.get(p.id) ?? {},
    })),
  })
}
