import { NextRequest } from "next/server"
import fs from "fs"
import path from "path"
import { db } from "@/lib/db"

// GET /api/v1/market/ticker — indices from the Thndr snapshot + top movers from
// our own MarketPrice history (latest snapshot vs previous, 90-day window,
// ±50% cap so stock splits / legacy bad-scale rows don't render as movers).

let cache: { data: unknown; at: number } | null = null

export async function GET(_req: NextRequest) {
  if (cache && Date.now() - cache.at < 60_000) return Response.json(cache.data)
  try {
    const snapFile = path.join(process.cwd(), "../egx-data/data/market-ticker.json")
    const snap = JSON.parse(fs.readFileSync(snapFile, "utf8")) as {
      asOf: string
      indices: { name: string; level: number; changePct: number }[]
    }
    const priceRows = (await db.$queryRawUnsafe(
      `SELECT c.ticker, mp.price, mp."asOf" FROM MarketPrice mp
       JOIN Company c ON c.id = mp."companyId" AND c."isActive" = 1
       ORDER BY mp."companyId", mp."asOf"`
    )) as { ticker: string; price: number; asOf: Date | string }[]
    // SQLite stores Prisma DateTimes in a format julianday() can't parse — do the
    // latest-vs-previous comparison in JS (13k rows, trivial)
    const byCompany = new Map<string, { price: number; ts: number }[]>()
    for (const r of priceRows) {
      const ts = new Date(r.asOf).getTime()
      if (Number.isNaN(ts) || ts < Date.now() - 100 * 86400_000) continue
      const arr = byCompany.get(r.ticker) ?? []
      arr.push({ price: r.price, ts })
      byCompany.set(r.ticker, arr)
    }
    const movers: { ticker: string; price: number; changePct: number }[] = []
    for (const [ticker, arr] of byCompany) {
      if (arr.length < 2) continue
      const last = arr[arr.length - 1]
      const prev = arr[arr.length - 2]
      if (prev.price > 0 && last.price > 0) {
        const changePct = +(((last.price - prev.price) / prev.price) * 100).toFixed(2)
        if (Math.abs(changePct) > 0.01 && Math.abs(changePct) <= 50) movers.push({ ticker, price: last.price, changePct })
      }
    }
    const gainers = [...movers].sort((a, b) => b.changePct - a.changePct).slice(0, 8)
    const losers = [...movers].sort((a, b) => a.changePct - b.changePct).slice(0, 8)
    const data = {
      asOf: snap.asOf,
      indices: snap.indices,
      gainers,
      losers,
      breadth: { gainers: movers.filter((m) => m.changePct > 0).length, losers: movers.filter((m) => m.changePct < 0).length },
    }
    cache = { data, at: Date.now() }
    return Response.json(data)
  } catch (e) {
    console.error("ticker-error", e)
    return Response.json({ asOf: null, indices: [], gainers: [], losers: [], breadth: { gainers: 0, losers: 0 } })
  }
}
