import { NextRequest } from "next/server"
import { cachedResponse } from "@/lib/public-cache"
import type { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { fetchCalcMany } from "@/lib/financial/statement-pref"
import { latestPriceByCompany } from "@/lib/financial/latest-price"
import { moverMap, readMarketSnapshot } from "@/lib/market/snapshot"

type CompanyWithCounts = Prisma.CompanyGetPayload<{
  include: { _count: { select: { reports: true; events: true; dividends: true } } }
}>

// GET /api/v1/companies — paginated, searchable, sector-filterable company list
// with a snapshot of latest-annual key metrics and the freshest market price.
//
// Query params:
//   search, sector, page, pageSize, ids, status
//   tickers=COMI,ETEL     explicit ticker set (used by featured/editorial rows)
//   sort=marketCap        sort by current price × shares outstanding
//
// Snapshot metrics are statement-type aware: per company, CONSOLIDATED
// calculated rows are preferred and STANDALONE rows are used only when the
// company has no consolidated rows (the two bases are never mixed).
//
// Market price comes from the public 15-minute-delayed snapshot first, then
// the durable MarketPrice table. Missing price/shares stays null; it is never
// replaced with zero.

// 30s in-process SWR cache keyed by the normalized query — the companies
// list is the busiest endpoint on the site (search + pagination + the
// snapshot merge). Stale-while-revalidate keeps it O(1) at scale.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const key = `companies:${url.searchParams.toString()}`
  return cachedResponse(key, 30 * 1000, () => listCompanies(url))
}

async function listCompanies(url: URL): Promise<unknown> {
  const search = url.searchParams.get("search")?.trim() || ""
  const sector = url.searchParams.get("sector")?.trim() || ""
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? 9) || 9))
  const sort = url.searchParams.get("sort") === "marketCap" ? "marketCap" : "ticker"

  const idsParam = url.searchParams.get("ids")
  const filterIds = idsParam
    ? [...new Set(idsParam.split(",").map((s) => s.trim()).filter((s) => s.length > 10))].slice(0, 200)
    : []

  const tickersParam = url.searchParams.get("tickers")
  const filterTickers = tickersParam
    ? [...new Set(tickersParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 50)
    : []

  const where: Record<string, unknown> = { isActive: true }
  if (sector) where.sector = sector
  if (idsParam !== null) where.id = { in: filterIds }
  if (filterTickers.length > 0) where.ticker = { in: filterTickers }

  const listingStatus = url.searchParams.get("status")?.trim().toUpperCase() || ""
  if (["LISTED", "SUSPENDED", "DELISTED"].includes(listingStatus)) where.listingStatus = listingStatus
  if (search) {
    where.OR = [
      { ticker: { contains: search } },
      { nameEn: { contains: search } },
      { nameAr: { contains: search } },
    ]
  }

  const snapshot = readMarketSnapshot()
  const movers = moverMap(snapshot)

  const includeCounts = { _count: { select: { reports: true, events: true, dividends: true } } } as const

  let total: number
  let pageCompanies: CompanyWithCounts[]

  if (sort === "marketCap") {
    // The active universe is small (~276). Fetch it, compute market cap from
    // the freshest price × shares, then paginate in memory. This is the only
    // way to sort by a value that is not a stored column.
    const all = await db.company.findMany({
      where,
      orderBy: { ticker: "asc" },
      take: 500,
      include: includeCounts,
    })

    const ids = all.map((c) => c.id)
    const dbPrices = ids.length
      ? await db.marketPrice.findMany({
          where: { companyId: { in: ids }, isDemoData: false },
          orderBy: { asOf: "desc" },
          select: { companyId: true, price: true, asOf: true },
        })
      : []
    const latestDb = latestPriceByCompany(dbPrices)

    const ranked = all
      .map((company) => {
        const mover = movers.get(company.ticker.toUpperCase())
        const price = mover?.price ?? latestDb.get(company.id)?.price ?? null
        const marketCap =
          price !== null && company.sharesOutstanding && company.sharesOutstanding > 0
            ? price * company.sharesOutstanding
            : null
        return { company, marketCap }
      })
      .sort((a, b) => {
        if (a.marketCap === null && b.marketCap === null) return a.company.ticker.localeCompare(b.company.ticker)
        if (a.marketCap === null) return 1
        if (b.marketCap === null) return -1
        return b.marketCap - a.marketCap || a.company.ticker.localeCompare(b.company.ticker)
      })

    total = ranked.length
    pageCompanies = ranked
      .slice((page - 1) * pageSize, page * pageSize)
      .map((r) => r.company) as typeof pageCompanies
  } else {
    const [count, companies] = await Promise.all([
      db.company.count({ where }),
      db.company.findMany({
        where,
        orderBy: { ticker: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: includeCounts,
      }),
    ])
    total = count
    pageCompanies = companies as typeof pageCompanies
  }

  const ids = pageCompanies.map((c) => c.id)

  const [{ filtered: metrics }, dbPrices] = await Promise.all([
    ids.length
      ? fetchCalcMany(ids, {
          periodType: "ANNUAL",
          code: { in: ["revenue", "net_profit", "roe", "total_assets"] },
        })
      : Promise.resolve({ filtered: [] as Awaited<ReturnType<typeof fetchCalcMany>>["filtered"] }),
    ids.length
      ? db.marketPrice.findMany({
          where: { companyId: { in: ids }, isDemoData: false },
          orderBy: { asOf: "desc" },
          select: { companyId: true, price: true, asOf: true },
        })
      : Promise.resolve([] as { companyId: string; price: number; asOf: Date }[]),
  ])

  const latestDb = latestPriceByCompany(dbPrices)

  const snapshotMetrics: Record<string, Record<string, { value: number | null; status: string; periodLabel: string; fiscalYear: number }>> = {}
  for (const m of metrics) {
    if (m.valueStatus !== "OK" || m.value === null) continue
    snapshotMetrics[m.companyId] ??= {}
    const existing = snapshotMetrics[m.companyId][m.code]
    if (!existing || m.fiscalYear > existing.fiscalYear) {
      snapshotMetrics[m.companyId][m.code] = {
        value: m.value,
        status: m.valueStatus,
        periodLabel: m.periodLabel,
        fiscalYear: m.fiscalYear,
      }
    }
  }

  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    sort,
    marketAsOf: snapshot?.pricesAsOf ?? snapshot?.asOf ?? null,
    delayMinutes: snapshot?.delayMinutes ?? null,
    companies: pageCompanies.map((c) => {
      const mover = movers.get(c.ticker.toUpperCase())
      const dbPrice = latestDb.get(c.id)
      const price = mover?.price ?? dbPrice?.price ?? null
      const marketCap =
        price !== null && c.sharesOutstanding && c.sharesOutstanding > 0
          ? price * c.sharesOutstanding
          : null
      return {
        id: c.id,
        ticker: c.ticker,
        isin: c.isin,
        nameEn: c.nameEn,
        nameAr: c.nameAr,
        sector: c.sector,
        industry: c.industry,
        listingStatus: c.listingStatus,
        egxCategory: c.egxCategory,
        irUrl: c.irUrl,
        isDemoData: c.isDemoData,
        counts: c._count,
        snapshot: snapshotMetrics[c.id] ?? {},
        marketPrice: price !== null
          ? {
              price,
              asOf: mover ? (snapshot?.pricesAsOf ?? snapshot?.asOf ?? null) : (dbPrice?.asOf.toISOString() ?? null),
              currency: "EGP",
              changePct: mover?.changePct ?? null,
            }
          : null,
        marketCap,
      }
    }),
  }
}
