import { NextRequest } from "next/server"
import { db } from "@/lib/db"

// GET /api/v1/companies — paginated, searchable, sector-filterable company list
// with a snapshot of latest-annual key metrics.

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const search = url.searchParams.get("search")?.trim() || ""
  const sector = url.searchParams.get("sector")?.trim() || ""
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? 9) || 9))

  const where: Record<string, unknown> = { isActive: true }
  if (sector) where.sector = sector
  if (search) {
    where.OR = [
      { ticker: { contains: search } },
      { nameEn: { contains: search } },
      { nameAr: { contains: search } },
    ]
  }

  const [total, companies] = await Promise.all([
    db.company.count({ where }),
    db.company.findMany({
      where,
      orderBy: { ticker: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { reports: true, events: true, dividends: true } } },
    }),
  ])

  // snapshot of latest annual metrics for the listed companies
  const ids = companies.map((c) => c.id)
  const metrics = ids.length
    ? await db.calculatedMetric.findMany({
        where: { companyId: { in: ids }, periodType: "ANNUAL", code: { in: ["revenue", "net_profit", "roe", "total_assets", "revenue_growth", "profit_growth"] } },
        orderBy: [{ fiscalYear: "asc" }],
      })
    : []

  const snapshot: Record<string, Record<string, { value: number | null; status: string; periodLabel: string }>> = {}
  for (const m of metrics) {
    if (m.valueStatus !== "OK" || m.value === null) continue
    snapshot[m.companyId] ??= {}
    // keep only the latest year per code
    const existing = snapshot[m.companyId][m.code]
    if (!existing || m.periodLabel > existing.periodLabel) {
      snapshot[m.companyId][m.code] = { value: m.value, status: m.valueStatus, periodLabel: m.periodLabel }
    }
  }

  return Response.json({
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    companies: companies.map((c) => ({
      id: c.id,
      ticker: c.ticker,
      nameEn: c.nameEn,
      nameAr: c.nameAr,
      sector: c.sector,
      industry: c.industry,
      listingStatus: c.listingStatus,
      isDemoData: c.isDemoData,
      counts: c._count,
      snapshot: snapshot[c.id] ?? {},
    })),
  })
}
