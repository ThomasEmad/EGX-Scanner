import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { audit } from "@/lib/audit"

// POST /api/v1/admin/subscriptions/{id}/cancel — cancel an active subscription.
//
// Race safety: only an ACTIVE subscription can be cancelled (conditional
// updateMany) — concurrent cancel/verify/reject calls converge to exactly one
// winner instead of the last write silently overwriting the rest.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin(req))) return await unauthorizedResponse()
  const { id } = await params

  const claim = await db.subscription.updateMany({
    where: { id, status: "ACTIVE" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  })

  if (claim.count === 0) {
    const sub = await db.subscription.findUnique({ where: { id }, select: { status: true, userId: true } })
    if (!sub) return Response.json({ error: "NOT_FOUND" }, { status: 404 })
    return Response.json({ error: "NOT_ACTIVE", status: sub.status, message: "Only an active subscription can be cancelled." }, { status: 409 })
  }

  const sub = await db.subscription.findUnique({ where: { id }, select: { userId: true } })
  await audit("SUBSCRIPTION_CANCELLED", { actor: "admin", entityType: "Subscription", entityId: id, details: `Subscription cancelled for ${sub?.userId ?? "unknown"}` })
  return Response.json({ ok: true, id, status: "CANCELLED" })
}
