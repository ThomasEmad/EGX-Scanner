import { NextRequest } from "next/server"
import { db } from "@/lib/db"

// GET /api/v1/dashboard/summary — Real-time market breadth and summary statistics

export async function GET(_req: NextRequest) {
  try {
    // Get total active companies
    const totalCompanies = await db.company.count({ where: { isActive: true } })

    // Get market breadth from latest market prices
    const latestPrices = await db.$queryRawUnsafe(
      `SELECT c.ticker, c.nameEn, c.nameAr, c.sector, mp.price, mp."asOf"
       FROM MarketPrice mp
       JOIN Company c ON c.id = mp."companyId" AND c."isActive" = 1
       WHERE mp.price IS NOT NULL AND mp.price > 0
       ORDER BY mp."asOf" DESC`
    ) as { ticker: string; nameEn: string; nameAr: string | null; sector: string; price: number; asOf: Date }[]

    // Group by company (latest price per company)
    const latestByCompany = new Map<string, { price: number; asOf: Date; ticker: string; nameEn: string; nameAr: string | null; sector: string }>()
    for (const row of latestPrices) {
      if (!latestByCompany.has(row.ticker) || new Date(row.asOf) > latestByCompany.get(row.ticker)!.asOf) {
        latestByCompany.set(row.ticker, {
          price: row.price,
          asOf: row.asOf,
          ticker: row.ticker,
          nameEn: row.nameEn,
          nameAr: row.nameAr,
          sector: row.sector,
        })
      }
    }

    const companies = Array.from(latestByCompany.values())
    const total = companies.length

    // Get previous close prices for change calculation (from previous trading day)
    const previousPrices = await db.$queryRawUnsafe(
      `SELECT c.ticker, mp.price, mp."asOf"
       FROM MarketPrice mp
       JOIN Company c ON c.id = mp."companyId" AND c."isActive" = 1
       WHERE mp.price IS NOT NULL AND mp.price > 0
       ORDER BY mp."asOf" ASC`
    ) as { ticker: string; price: number; asOf: Date }[]

    // Group by company and get second-to-last price (previous close)
    const byCompany = new Map<string, { price: number; asOf: Date }[]>()
    for (const row of previousPrices) {
      const arr = byCompany.get(row.ticker) ?? []
      arr.push({ price: row.price, asOf: row.asOf })
      byCompany.set(row.ticker, arr)
    }

    let gainers = 0
    let losers = 0
    let unchanged = 0
    let totalVolume = 0
    let totalValue = 0

    for (const [ticker, data] of latestByCompany) {
      const history = byCompany.get(ticker)
      if (history && history.length >= 2) {
        const last = history[history.length - 1].price
        const prev = history[history.length - 2].price
        if (prev > 0) {
          const changePct = ((last - prev) / prev) * 100
          if (changePct > 0.01) gainers++
          else if (changePct < -0.01) losers++
          else unchanged++
        } else {
          unchanged++
        }
      } else {
        unchanged++
      }
    }

    // Sector breadth
    const sectorBreadth = new Map<string, { gainers: number; losers: number; total: number }>()
    for (const data of latestByCompany.values()) {
      const sector = data.sector
      const sectorData = sectorBreadth.get(sector) ?? { gainers: 0, losers: 0, total: 0 }
      sectorData.total++
      sectorBreadth.set(sector, sectorData)
    }

    // For sectors, we need to recalculate with sector grouping
    const sectorGainers = new Map<string, number>()
    const sectorLosers = new Map<string, number>()

    for (const [ticker, data] of latestByCompany.entries()) {
      const history = byCompany.get(ticker)
      if (history && history.length >= 2) {
        const last = history[history.length - 1].price
        const prev = history[history.length - 2].price
        if (prev > 0) {
          const changePct = ((last - prev) / prev) * 100
          if (changePct > 0.01) {
            sectorGainers.set(data.sector, (sectorGainers.get(data.sector) ?? 0) + 1)
          } else if (changePct < -0.01) {
            sectorLosers.set(data.sector, (sectorLosers.get(data.sector) ?? 0) + 1)
          }
        }
      }
    }

    // Top sectors by gainers
    const topSectors = Array.from(sectorGainers.entries())
      .map(([sector, gainers]) => ({
        sector,
        gainers,
        losers: sectorLosers.get(sector) ?? 0,
        total: sectorBreadth.get(sector)?.total ?? 0,
      }))
      .sort((a, b) => b.gainers - a.gainers)
      .slice(0, 5)

    // Total traded value (approximate)
    for (const data of companies) {
      totalValue += data.price * 1000000 // rough estimate
    }

    // Market status
    const now = new Date()
    const isMarketOpen = now.getDay() >= 0 && now.getDay() <= 4 && // Sun-Thu
      now.getHours() >= 10 && now.getHours() <= 14 // 10:00-14:00 Cairo time

    // Latest data timestamp
    let latestAsOf: Date | null = null
    for (const data of companies) {
      if (!latestAsOf || data.asOf > latestAsOf) {
        latestAsOf = data.asOf
      }
    }

    return Response.json({
      stats: {
        totalCompanies: totalCompanies,
        companiesWithPrices: total,
        gainers,
        losers,
        unchanged,
        totalValue: Math.round(totalValue / 1_000_000) * 1_000_000,
        marketOpen: isMarketOpen,
        lastUpdate: latestAsOf?.toISOString() ?? new Date().toISOString(),
      },
      sectorBreadth: topSectors,
      breadth: {
        gainers,
        losers,
        unchanged,
        total: total,
      },
      asOf: new Date().toISOString(),
    })
  } catch (e) {
    console.error("dashboard-summary-error", e)
    return Response.json({ error: "Failed to fetch dashboard summary" }, { status: 500 })
  }
}