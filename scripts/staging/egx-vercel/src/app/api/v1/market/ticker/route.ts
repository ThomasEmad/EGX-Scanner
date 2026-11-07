import { NextRequest } from "next/server"
import fs from "fs"
import path from "path"
import { db } from "@/lib/db"

// GET /api/v1/market/ticker — index levels + top movers.
//
// The primary snapshot (`public/data/market-ticker.json`) is refreshed from the
// public TradingView Meza (15-minute delayed) by
// `scripts/refresh-market-snapshot.mjs`. It carries `indices`, `movers`,
// `indicesAsOf` and `pricesAsOf`, so the strip does not need a second database
// query and does not derive a previous close from a month-old row.
//
// The database path remains as a fallback for older snapshots that only contain
// indices; it compares the latest two MarketPrice points with a ±50% cap so
// splits / legacy bad-scale rows do not render as movers.

let cache: { data: unknown; at: number } | null = null

type SnapshotMover = { ticker: string; price: number; changePct: number }

export async function GET(req: NextRequest) {
  // Allow bypassing cache with ?fresh=true
  const isFresh = req.nextUrl.searchParams.get("fresh") === "true"
  if (!isFresh && cache && Date.now() - cache.at < 15_000) return Response.json(cache.data)
  try {
    // The snapshot ships inside `public/` so it is present in the standalone
    // build (the launcher copies `public/` into `.next/standalone`). Reading
    // `../egx-data` broke in production because the server's cwd is the
    // standalone folder, not the repo root.
    const snapFile = path.join(process.cwd(), "public", "data", "market-ticker.json")
    const snap = JSON.parse(fs.readFileSync(snapFile, "utf8")) as {
      asOf: string
      indicesAsOf?: string
      pricesAsOf?: string
      delayMinutes?: number | null
      indices: { name: string; level: number; changePct: number }[]
      movers?: SnapshotMover[]
    }

    let gainers: SnapshotMover[] = []
    let losers: SnapshotMover[] = []
    let breadth = { gainers: 0, losers: 0 }
    let pricesAsOf: string | null = snap.pricesAsOf ?? null

    if (Array.isArray(snap.movers) && snap.movers.length > 0) {
      const valid = snap.movers.filter(
        (m) => Number.isFinite(m.price) && m.price > 0 && Number.isFinite(m.changePct) && Math.abs(m.changePct) <= 50,
      )
      gainers = [...valid].sort((a, b) => b.changePct - a.changePct).slice(0, 8)
      losers = [...valid].sort((a, b) => a.changePct - b.changePct).slice(0, 8)
      breadth = {
        gainers: valid.filter((m) => m.changePct > 0).length,
        losers: valid.filter((m) => m.changePct < 0).length,
      }
      pricesAsOf = pricesAsOf ?? snap.asOf
    } else {
      const priceRows = (await db.$queryRawUnsafe(
        `SELECT c.ticker, mp.price, mp."asOf" FROM MarketPrice mp
         JOIN Company c ON c.id = mp."companyId" AND c."isActive" = 1
         ORDER BY mp."companyId", mp."asOf"`
      )) as { ticker: string; price: number; asOf: Date | string }[]
      // SQLite stores Prisma DateTimes in a format julianday() can't parse — do
      // the latest-vs-previous comparison in JS (13k rows, trivial)
      const byCompany = new Map<string, { price: number; ts: number }[]>()
      for (const r of priceRows) {
        const ts = new Date(r.asOf).getTime()
        if (Number.isNaN(ts) || ts < Date.now() - 100 * 86400_000) continue
        const arr = byCompany.get(r.ticker) ?? []
        arr.push({ price: r.price, ts })
        byCompany.set(r.ticker, arr)
      }
      const movers: SnapshotMover[] = []
      for (const [ticker, arr] of byCompany) {
        if (arr.length < 2) continue
        const last = arr[arr.length - 1]
        const prev = arr[arr.length - 2]
        if (prev.price > 0 && last.price > 0) {
          const changePct = +(((last.price - prev.price) / prev.price) * 100).toFixed(2)
          if (Math.abs(changePct) > 0.01 && Math.abs(changePct) <= 50) {
            movers.push({ ticker, price: last.price, changePct })
          }
        }
      }
      gainers = [...movers].sort((a, b) => b.changePct - a.changePct).slice(0, 8)
      losers = [...movers].sort((a, b) => a.changePct - b.changePct).slice(0, 8)
      breadth = {
        gainers: movers.filter((m) => m.changePct > 0).length,
        losers: movers.filter((m) => m.changePct < 0).length,
      }
      let latestTs = 0
      for (const rows of byCompany.values()) {
        const last = rows[rows.length - 1]
        if (last && last.ts > latestTs) latestTs = last.ts
      }
      pricesAsOf = latestTs ? new Date(latestTs).toISOString() : null
    }

    const indicesAsOf = snap.indicesAsOf ?? snap.asOf ?? null
    const clocks = [indicesAsOf, pricesAsOf].filter((v): v is string => Boolean(v)).sort()
    const asOf = clocks.length ? clocks[clocks.length - 1] : null
    const data = {
      asOf,
      indicesAsOf,
      pricesAsOf,
      delayMinutes: snap.delayMinutes ?? null,
      indices: snap.indices,
      gainers,
      losers,
      breadth,
    }
    cache = { data, at: Date.now() }
    return Response.json(data)
  } catch (e) {
    console.error("ticker-error", e)
    return Response.json({
      asOf: null,
      indicesAsOf: null,
      pricesAsOf: null,
      delayMinutes: null,
      indices: [],
      gainers: [],
      losers: [],
      breadth: { gainers: 0, losers: 0 },
    })
  }
}
