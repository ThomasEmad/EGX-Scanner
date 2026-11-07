import { NextRequest } from "next/server"
import { db } from "@/lib/db"

// GET /api/v1/market/history — Historical price data for charts
// Query params: symbol (e.g., EGX30), interval (1D, 1W, 1M, 3M, 1Y), range (1M, 3M, 6M, 1Y, 5Y)
// NOTE: Index historical data (EGX30, EGX70, EGX100) is NOT available via this endpoint
// because we do not have a licensed time-series data source for index levels.
// Only individual stock price history from MarketPrice table is served.

interface PricePoint {
  timestamp: string
  price: number
  volume?: number
}

const INTERVAL_MS: Record<string, number> = {
  "1D": 24 * 60 * 60 * 1000,
  "1W": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000,
  "3M": 90 * 24 * 60 * 60 * 1000,
  "6M": 180 * 24 * 60 * 60 * 1000,
  "1Y": 365 * 24 * 60 * 60 * 1000,
  "5Y": 5 * 365 * 24 * 60 * 60 * 1000,
}

const RANGE_MS: Record<string, number> = {
  "1D": 24 * 60 * 60 * 1000,
  "1W": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000,
  "3M": 90 * 24 * 60 * 60 * 1000,
  "6M": 180 * 24 * 60 * 60 * 1000,
  "1Y": 365 * 24 * 60 * 60 * 1000,
  "5Y": 5 * 365 * 24 * 60 * 60 * 1000,
}

const RANGE_LIMITS: Record<string, number> = {
  "1D": 100,
  "1W": 200,
  "1M": 500,
  "3M": 500,
  "6M": 500,
  "1Y": 500,
  "5Y": 500,
}

const INDEX_SYMBOLS = new Set(["EGX30", "EGX70", "EGX100", "EGX30CAPPED"])

function downsample<T>(arr: T[], maxPoints: number): T[] {
  if (arr.length <= maxPoints) return arr
  const step = arr.length / maxPoints
  const result: T[] = []
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.floor(i * step)
    result.push(arr[Math.min(idx, arr.length - 1)])
  }
  return result
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const symbol = searchParams.get("symbol") ?? "EGX30"
  const interval = searchParams.get("interval") ?? "1D"
  const range = searchParams.get("range") ?? "1M"

  if (!INTERVAL_MS[interval]) {
    return Response.json({ error: "Invalid interval" }, { status: 400 })
  }
  if (!RANGE_LIMITS[range]) {
    return Response.json({ error: "Invalid range" }, { status: 400 })
  }

  try {
    if (INDEX_SYMBOLS.has(symbol)) {
      return Response.json({
        error: "INDEX_HISTORY_UNAVAILABLE",
        message: "Historical index data is not available. This endpoint only serves individual stock price history from verified MarketPrice records. Index time-series requires a licensed data feed.",
        symbol,
        interval,
        range,
        data: [],
        asOf: new Date().toISOString(),
      }, { status: 404 })
    }

    const rows = await db.$queryRawUnsafe(
      `SELECT c.ticker, mp.price, mp."asOf"
       FROM "MarketPrice" mp
       JOIN "Company" c ON c.id = mp."companyId" AND c."isActive" = true
       WHERE c.ticker = $1
       ORDER BY mp."asOf" DESC
       LIMIT $2`,
      symbol,
      RANGE_LIMITS[range]
    ) as { ticker: string; price: number; asOf: Date }[]

    if (rows.length === 0) {
      return Response.json({
        symbol,
        interval,
        range,
        data: [],
        asOf: new Date().toISOString(),
        note: "No price history found for this symbol",
      })
    }

    const pricePoints: PricePoint[] = rows
      .map((r) => ({
        timestamp: new Date(r.asOf).toISOString(),
        price: r.price,
      }))
      .reverse()

    const data = downsample(pricePoints, RANGE_LIMITS[range])

    return Response.json({
      symbol,
      interval,
      range,
      data,
      asOf: new Date().toISOString(),
    })
  } catch (e) {
    console.error("history-error", e)
    return Response.json({ error: "Failed to fetch history" }, { status: 500 })
  }
}