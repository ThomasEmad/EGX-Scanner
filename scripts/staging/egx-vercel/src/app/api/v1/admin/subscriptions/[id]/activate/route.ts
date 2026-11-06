import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { audit } from "@/lib/audit"

// POST /api/v1/admin/subscriptions/{id}/activate — activate a pending subscription (30 days).
//
// Race safety: activation flips PENDING → ACTIVE through a conditional
// updateMany, so double-clicks and a concurrent verify/reject path can never
// re-activate an already-active or reviewed subscription (the old code
// accepted any source status and silently reset the 30-day window).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin(req))) return await unauthorizedResponse()
  const { id } = await params

  const now = new Date()
  const claim = await db.subscription.updateMany({
    where: { id, status: "PENDING" },
    data: {
      status: "ACTIVE",
      startDate: now,
      endDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      activatedAt: now,
    },
  })

  if (claim.count === 0) {
    const sub = await db.subscription.findUnique({ where: { id }, select: { status: true, userId: true } })
    if (!sub) return Response.json({ error: "NOT_FOUND" }, { status: 404 })
    return Response.json({ error: "NOT_PENDING", status: sub.status, message: "Only a pending subscription can be activated." }, { status: 409 })
  }

  const sub = await db.subscription.findUnique({ where: { id }, select: { userId: true } })
  await audit("SUBSCRIPTION_ACTIVATED", { actor: "admin", entityType: "Subscription", entityId: id, details: `Premium activated for ${sub?.userId ?? "unknown"} (30d)` })
  return Response.json({ ok: true, id, status: "ACTIVE" })
}
