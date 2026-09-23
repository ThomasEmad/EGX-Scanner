import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { upsertPrice } from "@/lib/financial/market"
import { audit } from "@/lib/audit"

// Market-data adapter endpoints (admin-gated).
// POST /api/v1/admin/market-prices — upsert a price point { companyId, asOf, price, sourceName }
// GET  /api/v1/admin/market-prices?companyId= — recent price points (most recent first)
// When a price exists, P/B / P/E / market cap / dividend yield are computed by the
// calculation engine (p_b@2 …). Without prices they stay DATA_UNAVAILABLE.

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return unauthorizedResponse()
  }
  const body = await req.json().catch(() => null)
  const companyId = typeof body?.companyId === "string" ? body.companyId : null
  const price = typeof body?.price === "number" && Number.isFinite(body.price) && body.price > 0 ? body.price : null
  const asOf = typeof body?.asOf === "string" && !Number.isNaN(Date.parse(body.asOf)) ? new Date(body.asOf) : null

  if (!companyId || price === null || !asOf) {
    return Response.json(
      { error: "VALIDATION", message: "companyId, price (> 0) and asOf (ISO date) are required" },
      { status: 400 }
    )
  }

  const company = await db.company.findUnique({ where: { id: companyId }, select: { id: true, ticker: true } })
  if (!company) return Response.json({ error: "NOT_FOUND", message: "Company not found" }, { status: 404 })

  const row = await upsertPrice({
    companyId,
    asOf,
    price,
    currency: typeof body?.currency === "string" ? body.currency : undefined,
    sourceName: typeof body?.sourceName === "string" && body.sourceName.trim() ? body.sourceName.trim() : "Manual entry",
    isDemoData: typeof body?.isDemoData === "boolean" ? body.isDemoData : false,
    notes: typeof body?.notes === "string" ? body.notes : null,
  })

  await audit("MARKET_PRICE_UPSERT", {
    actor: "admin",
    entityType: "MarketPrice",
    entityId: row.id,
    details: `${company.ticker} @ ${row.price} ${row.currency} asOf ${row.asOf.toISOString().slice(0, 10)} (source: ${row.sourceName})`,
  })

  // Recompute so market-dependent metrics reflect the new price point
  const { recomputeCompany } = await import("@/lib/financial/recompute")
  await recomputeCompany(companyId)

  return Response.json({ price: row })
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return unauthorizedResponse()
  }
  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get("companyId")
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 50) || 50, 1), 200)

  const prices = await db.marketPrice.findMany({
    where: companyId ? { companyId } : undefined,
    orderBy: { asOf: "desc" },
    take: limit,
    include: { company: { select: { ticker: true, nameEn: true } } },
  })

  return Response.json({ prices })
}
