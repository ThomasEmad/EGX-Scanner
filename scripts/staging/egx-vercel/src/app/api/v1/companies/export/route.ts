import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { readMarketSnapshot } from "@/lib/market/snapshot"

// GET /api/v1/companies/export — CSV download of the whole active-company
// directory with the freshest recorded price. Public data, 5-minute cache.
// Used by the "تصدير CSV" button on /companies and by power users/scripts.

export async function GET(_req: NextRequest) {
  const snapshot = readMarketSnapshot()
  const movers = new Map<string, { price: number; changePct: number | null }>()
  for (const m of snapshot?.movers ?? []) {
    movers.set(m.ticker.toUpperCase(), { price: m.price, changePct: m.changePct ?? null })
  }

  const companies = await db.company.findMany({
    where: { isActive: true },
    select: {
      id: true,
      ticker: true,
      isin: true,
      nameEn: true,
      nameAr: true,
      sector: true,
      industry: true,
      egxCategory: true,
      listingStatus: true,
      sharesOutstanding: true,
    },
    orderBy: { ticker: "asc" },
  })

  const ids = companies.map((c) => c.id)
  const dbPrices = ids.length
    ? await db.marketPrice.findMany({
        where: { companyId: { in: ids }, price: { gte: 0.0000001 } },
        orderBy: [{ companyId: "asc" }, { asOf: "asc" }],
        select: { companyId: true, price: true, asOf: true },
      })
    : []
  const latestDb = new Map<string, { price: number; asOf: Date }>()
  for (const p of dbPrices) latestDb.set(p.companyId, { price: p.price, asOf: p.asOf })

  const esc = (v: unknown): string => {
    const s = v === null || v === undefined ? "" : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const header = [
    "ticker", "name_en", "name_ar", "isin", "sector", "industry", "egx_category",
    "listing_status", "price_egp", "price_as_of_utc", "change_pct", "shares_outstanding", "market_cap_egp",
  ]
  const lines = [header.join(",")]
  for (const c of companies) {
    const snap = movers.get(c.ticker.toUpperCase())
    const dbp = latestDb.get(c.id)
    const price = snap?.price ?? dbp?.price ?? null
    const asOf = snap ? (snapshot?.pricesAsOf ?? snapshot?.asOf ?? "") : (dbp?.asOf.toISOString() ?? "")
    const changePct = snap?.changePct ?? null
    const marketCap = price !== null && c.sharesOutstanding && c.sharesOutstanding > 0 ? price * c.sharesOutstanding : null
    lines.push([
      esc(c.ticker),
      esc(c.nameEn),
      esc(c.nameAr ?? ""),
      esc(c.isin ?? ""),
      esc(c.sector),
      esc(c.industry ?? ""),
      esc(c.egxCategory ?? ""),
      esc(c.listingStatus),
      price !== null ? price.toFixed(2) : "",
      esc(asOf),
      changePct !== null ? changePct.toFixed(2) : "",
      c.sharesOutstanding ?? "",
      marketCap !== null ? Math.round(marketCap).toString() : "",
    ].join(","))
  }

  const asOf = snapshot?.pricesAsOf ?? snapshot?.asOf ?? new Date().toISOString()
  return new Response("\uFEFF" + lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="egx-companies-${asOf.slice(0, 10)}.csv"`,
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    },
  })
}
