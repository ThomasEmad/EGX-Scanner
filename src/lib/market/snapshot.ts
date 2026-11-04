// Read the public, 15-minute-delayed market snapshot that is written by
// `scripts/refresh-market-snapshot.mjs`.
//
// The snapshot lives under `public/data/` so it is copied into the standalone
// build. It is the freshest market-data source the platform has; the database
// `MarketPrice` table is the durable fallback and may be older.
//
// This helper is server-only (it uses `fs`). It never invents a price: a
// missing/corrupt snapshot returns `null` and callers must render "—".

import fs from "node:fs"
import path from "node:path"

export interface MarketSnapshotMover {
  ticker: string
  price: number
  changePct: number
  volume?: number
}

export interface MarketSnapshotIndex {
  name: string
  level: number
  changePct: number
}

export interface MarketSnapshot {
  asOf: string | null
  indicesAsOf: string | null
  pricesAsOf: string | null
  delayMinutes: number | null
  indices: MarketSnapshotIndex[]
  movers: MarketSnapshotMover[]
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

/** Read and validate the snapshot. Returns null when it is absent or unusable. */
export function readMarketSnapshot(): MarketSnapshot | null {
  try {
    const file = path.join(process.cwd(), "public", "data", "market-ticker.json")
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>

    const indices = Array.isArray(raw.indices)
      ? raw.indices
          .map((item) => {
            const row = item as Record<string, unknown>
            const name = asString(row.name)
            const level = asNumber(row.level)
            const changePct = asNumber(row.changePct)
            return name && level !== null && changePct !== null ? { name, level, changePct } : null
          })
          .filter((v): v is MarketSnapshotIndex => v !== null)
      : []

    const movers = Array.isArray(raw.movers)
      ? raw.movers
          .map((item) => {
            const row = item as Record<string, unknown>
            const ticker = asString(row.ticker)
            const price = asNumber(row.price)
            const changePct = asNumber(row.changePct)
            const volume = asNumber(row.volume)
            if (!ticker || price === null || price <= 0 || changePct === null || Math.abs(changePct) > 50) {
              return null
            }
            return { ticker, price, changePct, ...(volume !== null ? { volume } : {}) }
          })
          .filter((v): v is MarketSnapshotMover => v !== null)
      : []

    const asOf = asString(raw.asOf)
    const indicesAsOf = asString(raw.indicesAsOf) ?? asOf
    const pricesAsOf = asString(raw.pricesAsOf) ?? asOf
    const delayMinutes = asNumber(raw.delayMinutes)

    if (!asOf && !indicesAsOf && !pricesAsOf && indices.length === 0 && movers.length === 0) {
      return null
    }

    return { asOf, indicesAsOf, pricesAsOf, delayMinutes, indices, movers }
  } catch {
    return null
  }
}

/** Ticker -> mover map. Tickers are upper-cased for stable matching. */
export function moverMap(snapshot: MarketSnapshot | null): Map<string, MarketSnapshotMover> {
  const map = new Map<string, MarketSnapshotMover>()
  for (const mover of snapshot?.movers ?? []) map.set(mover.ticker.toUpperCase(), mover)
  return map
}
