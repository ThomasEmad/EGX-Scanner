import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { requireAuth, unauthorizedResponse } from "@/lib/access"
import { isPremiumUser } from "@/lib/subscription"

// GET /api/v1/portfolio — the caller's holdings valued at latest recorded prices.
// POST — add or update a holding (upsert by company). Free: 2 companies, Premium: unlimited.
// PATCH /api/v1/portfolio — update quantity/avgCost/notes. DELETE /api/v1/portfolio?id= — remove.

const FREE_LIMIT = 2

export async function GET(req: NextRequest) {
  const userId = await requireAuth(req)
  if (!userId) return unauthorizedResponse()

  const holdings = await db.portfolioHolding.findMany({
    where: { userId },
    include: {
      company: { select: { id: true, ticker: true, nameEn: true, nameAr: true, sector: true, listingStatus: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  // latest recorded price per held company — one batched raw query
  const ids = holdings.map((h) => h.companyId)
  const prices = ids.length
    ? ((await db.$queryRawUnsafe(
        `SELECT mp."companyId", mp.price, mp."asOf", mp.currency
         FROM MarketPrice mp
         WHERE mp."companyId" IN (${ids.map(() => "?").join(",")})
           AND mp."asOf" = (SELECT MAX("asOf") FROM MarketPrice WHERE "companyId" = mp."companyId")`,
        ...ids
      )) as { companyId: string; price: number; asOf: Date; currency: string }[])
    : []
  const priceByCompany = new Map(prices.map((p) => [p.companyId, p]))

  // trailing-12-month DPS per held company (for expected annual dividend income)
  const dpsRows = ids.length
    ? ((await db.$queryRawUnsafe(
        `SELECT d."companyId", SUM(d."dividendPerShare") AS dps
         FROM Dividend d
         WHERE d."companyId" IN (${ids.map(() => "?").join(",")})
           AND d."dividendPerShare" IS NOT NULL
           AND COALESCE(d."announcementDate", d."createdAt") >= ?
         GROUP BY d."companyId"`,
        ...ids, new Date(Date.now() - 365 * 24 * 3600 * 1000)
      )) as { companyId: string; dps: number }[])
    : []
  const dpsByCompany = new Map(dpsRows.map((r) => [r.companyId, r.dps]))

  const rows = holdings.map((h) => {
    const p = priceByCompany.get(h.companyId)
    const price = p?.price ?? null
    const marketValue = price !== null ? price * h.quantity : null
    const cost = h.avgCost * h.quantity
    const pl = marketValue !== null ? marketValue - cost : null
    const plPct = pl !== null && cost > 0 ? (pl / cost) * 100 : null
    return {
      id: h.id,
      companyId: h.companyId,
      ticker: h.company.ticker,
      nameEn: h.company.nameEn,
      nameAr: h.company.nameAr,
      sector: h.company.sector,
      listingStatus: h.company.listingStatus,
      quantity: h.quantity,
      avgCost: h.avgCost,
      notes: h.notes,
      price,
      priceAsOf: p?.asOf?.toISOString() ?? null,
      currency: p?.currency ?? "EGP",
      marketValue,
      cost,
      pl,
      plPct,
      ttmDps: dpsByCompany.get(h.companyId) ?? null,
      expectedDividend: (dpsByCompany.get(h.companyId) ?? null) !== null ? (dpsByCompany.get(h.companyId) as number) * h.quantity : null,
    }
  })

  const totalMarketValue = rows.reduce((s, r) => s + (r.marketValue ?? r.cost), 0)
  const totalCost = rows.reduce((s, r) => s + r.cost, 0)
  const totalPl = totalMarketValue - totalCost
  const totalExpectedDividend = rows.reduce((s, r) => s + (r.expectedDividend ?? 0), 0)

  // sector exposure on valued positions
  const bySector = new Map<string, number>()
  for (const r of rows) {
    const v = r.marketValue ?? r.cost
    bySector.set(r.sector, (bySector.get(r.sector) ?? 0) + v)
  }
  const sectors = [...bySector.entries()]
    .map(([sector, value]) => ({ sector, value, pct: totalMarketValue > 0 ? (value / totalMarketValue) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)

  return Response.json({
    holdings: rows,
    totals: {
      marketValue: totalMarketValue,
      cost: totalCost,
      pl: totalPl,
      plPct: totalCost > 0 ? (totalPl / totalCost) * 100 : null,
      count: rows.length,
      priceGaps: rows.filter((r) => r.price === null).length,
      expectedDividend: totalExpectedDividend,
      dividendYieldOnCost: totalCost > 0 && totalExpectedDividend > 0 ? (totalExpectedDividend / totalCost) * 100 : null,
    },
    sectors,
  })
}

export async function POST(req: NextRequest) {
  const userId = await requireAuth(req)
  if (!userId) return unauthorizedResponse()

  let body: { companyId?: unknown; quantity?: unknown; avgCost?: unknown; notes?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "INVALID_PAYLOAD" }, { status: 400 })
  }
  const companyId = typeof body.companyId === "string" ? body.companyId : ""
  const quantity = Number(body.quantity)
  const avgCost = Number(body.avgCost)
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 300) || null : null
  if (!companyId || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(avgCost) || avgCost < 0) {
    return Response.json({ error: "INVALID_PAYLOAD", message: "companyId, quantity > 0 and avgCost >= 0 are required." }, { status: 400 })
  }
  const company = await db.company.findUnique({ where: { id: companyId }, select: { id: true } })
  if (!company) return Response.json({ error: "NOT_FOUND", message: "Company not found." }, { status: 404 })

  const existing = await db.portfolioHolding.findUnique({ where: { userId_companyId: { userId, companyId } } })
  if (!existing) {
    const count = await db.portfolioHolding.count({ where: { userId } })
    if (count >= FREE_LIMIT && !(await isPremiumUser(userId))) {
      return Response.json(
        { error: "PORTFOLIO_LIMIT", message: "الخطة المجانية تشمل شركتين فقط — بريميوم بلا حدود.", limit: FREE_LIMIT },
        { status: 403 }
      )
    }
  }

  const holding = await db.portfolioHolding.upsert({
    where: { userId_companyId: { userId, companyId } },
    create: { userId, companyId, quantity, avgCost, notes },
    update: { quantity, avgCost, notes },
  })
  return Response.json({ holding })
}

export async function PATCH(req: NextRequest) {
  const userId = await requireAuth(req)
  if (!userId) return unauthorizedResponse()
  let body: { id?: unknown; quantity?: unknown; avgCost?: unknown; notes?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "INVALID_PAYLOAD" }, { status: 400 })
  }
  const id = typeof body.id === "string" ? body.id : ""
  if (!id) return Response.json({ error: "INVALID_PAYLOAD" }, { status: 400 })
  const holding = await db.portfolioHolding.findUnique({ where: { id } })
  if (!holding || holding.userId !== userId) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const quantity = body.quantity !== undefined ? Number(body.quantity) : holding.quantity
  const avgCost = body.avgCost !== undefined ? Number(body.avgCost) : holding.avgCost
  const notes = body.notes !== undefined ? (typeof body.notes === "string" ? body.notes.trim().slice(0, 300) || null : null) : holding.notes
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(avgCost) || avgCost < 0) {
    return Response.json({ error: "INVALID_PAYLOAD" }, { status: 400 })
  }
  const updated = await db.portfolioHolding.update({ where: { id }, data: { quantity, avgCost, notes } })
  return Response.json({ holding: updated })
}

export async function DELETE(req: NextRequest) {
  const userId = await requireAuth(req)
  if (!userId) return unauthorizedResponse()
  const id = new URL(req.url).searchParams.get("id") ?? ""
  if (!id) return Response.json({ error: "INVALID_PAYLOAD" }, { status: 400 })
  const holding = await db.portfolioHolding.findUnique({ where: { id } })
  if (!holding || holding.userId !== userId) return Response.json({ error: "NOT_FOUND" }, { status: 404 })
  await db.portfolioHolding.delete({ where: { id } })
  return Response.json({ ok: true })
}
