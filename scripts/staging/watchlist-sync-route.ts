import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/auth"
import { checkEndpointRateLimit, getClientIp } from "@/lib/rate-limit"

// GET /api/v1/watchlist/sync — the signed-in user's saved watchlist.
// PUT /api/v1/watchlist/sync — { ids: string[] } full replace (client wins on
//                               login — localStorage list is authoritative at
//                               that moment).
// POST /api/v1/watchlist/sync — { companyId, action: "add" | "remove" } for
//                               single toggles while signed in.
//
// Guests keep the localStorage watchlist; signed-in users get the same list
// on every device. Merging happens client-side (the client lib merges server
// items into the local store after login).

export async function GET(req: NextRequest) {
  const userId = await getSessionUser(req.headers.get("x-session-token"))
  if (!userId) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 })
  const items = await db.watchlistItem.findMany({
    where: { userId },
    select: { companyId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  })
  return Response.json(
    { ids: items.map((i) => i.companyId) },
    { headers: { "Cache-Control": "no-store" } }
  )
}

export async function PUT(req: NextRequest) {
  const userId = await getSessionUser(req.headers.get("x-session-token"))
  if (!userId) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 })

  const rl = await checkEndpointRateLimit("watchlist-sync", getClientIp(req))
  if (!rl.allowed) return Response.json({ error: "RATE_LIMITED" }, { status: 429 })

  const body = await req.json().catch(() => ({}))
  const ids = Array.isArray(body?.ids)
    ? [...new Set(body.ids.filter((x: unknown) => typeof x === "string" && x.length > 10))].slice(0, 200)
    : null
  if (!ids) return Response.json({ error: "VALIDATION", message: "ids array is required" }, { status: 400 })

  // only real, active companies survive the sync
  const valid = await db.company.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true } })
  const validIds = new Set(valid.map((c) => c.id))

  await db.$transaction([
    db.watchlistItem.deleteMany({ where: { userId } }),
    ...ids.filter((id: string) => validIds.has(id)).map((id: string) =>
      db.watchlistItem.create({ data: { userId, companyId: id } })
    ),
  ])

  return Response.json({ ok: true, saved: [...validIds].length })
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUser(req.headers.get("x-session-token"))
  if (!userId) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 })

  const rl = await checkEndpointRateLimit("watchlist-sync", getClientIp(req))
  if (!rl.allowed) return Response.json({ error: "RATE_LIMITED" }, { status: 429 })

  const body = await req.json().catch(() => ({}))
  const companyId = typeof body?.companyId === "string" ? body.companyId : ""
  const action = body?.action === "add" ? "add" : body?.action === "remove" ? "remove" : null
  if (!companyId || !action) {
    return Response.json({ error: "VALIDATION", message: "companyId and action (add|remove) required" }, { status: 400 })
  }

  if (action === "remove") {
    await db.watchlistItem.deleteMany({ where: { userId, companyId } })
    return Response.json({ ok: true })
  }

  const company = await db.company.findUnique({ where: { id: companyId }, select: { id: true, isActive: true } })
  if (!company || !company.isActive) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  await db.watchlistItem.upsert({
    where: { userId_companyId: { userId, companyId } },
    update: {},
    create: { userId, companyId },
  })
  return Response.json({ ok: true })
}
