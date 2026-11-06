import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/auth"
import { checkEndpointRateLimit, getClientIp } from "@/lib/rate-limit"
import { audit } from "@/lib/audit"
import { readMarketSnapshot } from "@/lib/market/snapshot"
import { latestPriceByCompany } from "@/lib/financial/latest-price"

// GET    /api/v1/alerts            — list the signed-in user's price alerts
//                                    (lazily evaluates active alerts against
//                                    the freshest recorded price and marks
//                                    newly-triggered ones).
// POST   /api/v1/alerts            — { companyId, direction: ABOVE|BELOW,
//                                    targetPrice } — max 20 active per user.
// DELETE /api/v1/alerts?id=...     — owner-only removal.
//
// Evaluation model: alerts fire against RECORDED market prices (the same
// 15-minute-delayed snapshot the rest of the platform shows) — never against
// intraday guesses. Lazy evaluation on read keeps the model simple and the
// write load zero: the client polls while the session is open.

const MAX_ACTIVE_ALERTS = 20

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-session-token")
  const userId = await getSessionUser(token)
  if (!userId) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 })

  const alerts = await db.priceAlert.findMany({
    where: { userId },
    include: {
      company: { select: { id: true, ticker: true, nameEn: true, nameAr: true, sector: true } },
    },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  })

  // lazy evaluation against the freshest recorded price
  const active = alerts.filter((a) => a.active)
  if (active.length > 0) {
    const snapshot = readMarketSnapshot()
    const moverMap = new Map<string, { price: number; asOf: string | null }>()
    for (const m of snapshot?.movers ?? []) {
      moverMap.set(m.ticker.toUpperCase(), { price: m.price, asOf: snapshot?.pricesAsOf ?? snapshot?.asOf ?? null })
    }

    const ids = [...new Set(active.map((a) => a.companyId))]
    const dbPrices = await db.marketPrice.findMany({
      where: { companyId: { in: ids }, price: { gte: 0.0000001 } },
      orderBy: [{ companyId: "asc" }, { asOf: "asc" }],
      select: { companyId: true, price: true, asOf: true },
    })
    const dbLatest = latestPriceByCompany(
      dbPrices.filter((p) => p.price !== null).map((p) => ({ companyId: p.companyId, asOf: p.asOf, price: p.price as number }))
    )

    const triggered: string[] = []
    const priced = active.map((a) => {
      const ticker = a.company.ticker.toUpperCase()
      const snap = moverMap.get(ticker)
      const price = snap?.price ?? dbLatest.get(a.companyId)?.price ?? null
      const asOf = snap?.asOf ?? dbLatest.get(a.companyId)?.asOf?.toISOString() ?? null
      const hit =
        price !== null &&
        ((a.direction === "ABOVE" && price >= a.targetPrice) || (a.direction === "BELOW" && price <= a.targetPrice))
      if (hit) triggered.push(a.id)
      return {
        id: a.id,
        companyId: a.companyId,
        ticker: a.company.ticker,
        nameEn: a.company.nameEn,
        nameAr: a.company.nameAr,
        sector: a.company.sector,
        direction: a.direction,
        targetPrice: a.targetPrice,
        active: a.active,
        triggeredAt: a.triggeredAt?.toISOString() ?? null,
        currentPrice: price,
        priceAsOf: asOf,
        hitNow: hit,
      }
    })

    if (triggered.length > 0) {
      await db.priceAlert.updateMany({
        where: { id: { in: triggered }, userId },
        data: { active: false, triggeredAt: new Date() },
      })
    }

    const inactive = alerts
      .filter((a) => !a.active)
      .map((a) => ({
        id: a.id,
        companyId: a.companyId,
        ticker: a.company.ticker,
        nameEn: a.company.nameEn,
        nameAr: a.company.nameAr,
        sector: a.company.sector,
        direction: a.direction,
        targetPrice: a.targetPrice,
        active: a.active,
        triggeredAt: a.triggeredAt?.toISOString() ?? null,
        currentPrice: null,
        priceAsOf: null,
        hitNow: false,
      }))

    return Response.json({ alerts: [...priced, ...inactive] }, { headers: { "Cache-Control": "no-store" } })
  }

  return Response.json(
    {
      alerts: alerts.map((a) => ({
        id: a.id,
        companyId: a.companyId,
        ticker: a.company.ticker,
        nameEn: a.company.nameEn,
        nameAr: a.company.nameAr,
        sector: a.company.sector,
        direction: a.direction,
        targetPrice: a.targetPrice,
        active: a.active,
        triggeredAt: a.triggeredAt?.toISOString() ?? null,
        currentPrice: null,
        priceAsOf: null,
        hitNow: false,
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-session-token")
  const userId = await getSessionUser(token)
  if (!userId) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 })

  const rl = await checkEndpointRateLimit("alerts-write", getClientIp(req))
  if (!rl.allowed) {
    return Response.json({ error: "RATE_LIMITED", message: "Too many changes — slow down a little." }, { status: 429 })
  }

  const body = await req.json().catch(() => ({}))
  const companyId = typeof body?.companyId === "string" ? body.companyId : ""
  const direction = body?.direction === "ABOVE" ? "ABOVE" : body?.direction === "BELOW" ? "BELOW" : null
  const targetPrice = Number(body?.targetPrice)

  if (!companyId || !direction || !Number.isFinite(targetPrice) || targetPrice <= 0) {
    return Response.json(
      { error: "VALIDATION", message: "companyId, direction (ABOVE|BELOW) and a positive targetPrice are required" },
      { status: 400 }
    )
  }

  const company = await db.company.findUnique({ where: { id: companyId }, select: { id: true, isActive: true } })
  if (!company || !company.isActive) {
    return Response.json({ error: "NOT_FOUND", message: "Unknown company" }, { status: 404 })
  }

  const activeCount = await db.priceAlert.count({ where: { userId, active: true } })
  if (activeCount >= MAX_ACTIVE_ALERTS) {
    return Response.json(
      { error: "QUOTA", message: `You can keep up to ${MAX_ACTIVE_ALERTS} active alerts` },
      { status: 402 }
    )
  }

  const alert = await db.priceAlert.create({
    data: { userId, companyId, direction, targetPrice },
    select: { id: true },
  })
  await audit("ALERT_CREATED", {
    actor: userId,
    entityType: "PriceAlert",
    entityId: alert.id,
    details: `${direction} ${targetPrice} for company ${companyId}`,
  })

  return Response.json({ ok: true, id: alert.id }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const token = req.headers.get("x-session-token")
  const userId = await getSessionUser(token)
  if (!userId) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 })

  const id = new URL(req.url).searchParams.get("id") || ""
  const existing = await db.priceAlert.findUnique({ where: { id }, select: { userId: true } })
  if (!existing || existing.userId !== userId) {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 })
  }
  await db.priceAlert.delete({ where: { id } })
  return Response.json({ ok: true })
}
