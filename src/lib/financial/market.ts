// Market data adapter (server-only).
// The scanner spec keeps market-dependent metrics separate from filings: a price
// point is an OBSERVED input from a data source — never inferred from financials.
// This module is the seam where a real market-data provider plugs in; in this
// environment prices come from the (clearly-labeled) demo feed seeded into
// MarketPrice, or from admin POST /api/v1/admin/market-prices.

import { db } from "@/lib/db"

export interface PricePoint {
  price: number
  asOf: Date
  currency: string
  sourceName: string
  isDemoData: boolean
}

/** Latest known price for a company (highest asOf), or null when no price exists. */
export async function getLatestPrice(companyId: string): Promise<PricePoint | null> {
  const row = await db.marketPrice.findFirst({
    where: { companyId },
    orderBy: { asOf: "desc" },
    take: 1,
  })
  if (!row) return null
  return {
    price: row.price,
    asOf: row.asOf,
    currency: row.currency,
    sourceName: row.sourceName,
    isDemoData: row.isDemoData,
  }
}

/**
 * Sum of dividends-per-share announced within the trailing 12 months of `asOf`.
 * Returns undefined when the company has no usable per-share value in the window
 * (the caller distinguishes "no records at all" from "records without values").
 */
export async function sumDps12m(
  companyId: string,
  asOf: Date
): Promise<{ dps12m?: number; hasRecords: boolean }> {
  const windowStart = new Date(asOf)
  windowStart.setDate(windowStart.getDate() - 365)

  const [totalInWindow, recordCount] = await Promise.all([
    db.dividend.aggregate({
      where: {
        companyId,
        dividendPerShare: { not: null },
        announcementDate: { gte: windowStart, lte: asOf },
      },
      _sum: { dividendPerShare: true },
    }),
    db.dividend.count({ where: { companyId } }),
  ])

  const sum = totalInWindow._sum.dividendPerShare
  return {
    dps12m: sum === null ? undefined : sum,
    hasRecords: recordCount > 0,
  }
}

/** Upsert a price point (market-data adapter write path, admin-gated upstream). */
export async function upsertPrice(input: {
  companyId: string
  asOf: Date
  price: number
  currency?: string
  sourceName: string
  isDemoData?: boolean
  notes?: string | null
}) {
  return db.marketPrice.upsert({
    where: { companyId_asOf: { companyId: input.companyId, asOf: input.asOf } },
    create: {
      companyId: input.companyId,
      asOf: input.asOf,
      price: input.price,
      currency: input.currency ?? "EGP",
      sourceName: input.sourceName,
      isDemoData: input.isDemoData ?? false,
      notes: input.notes ?? null,
    },
    update: {
      price: input.price,
      currency: input.currency ?? "EGP",
      sourceName: input.sourceName,
      isDemoData: input.isDemoData ?? false,
      notes: input.notes ?? null,
    },
  })
}
