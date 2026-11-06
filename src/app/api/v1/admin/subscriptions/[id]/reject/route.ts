import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { audit } from "@/lib/audit"

// POST /api/v1/admin/subscriptions/{id}/reject — admin rejects a pending subscription request.
//
// Race safety: conditional updateMany guards PENDING → REJECTED so a reject
// racing an activate or payment verify can no longer overwrite an active
// subscription (the old code rejected whatever status it found).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin(req))) return await unauthorizedResponse()
  const { id } = await params

  const body = (await req.json().catch(() => ({}))) as { adminNote?: string }
  const note = (body.adminNote ?? "").trim() || null

  const claim = await db.subscription.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "REJECTED", notes: note },
  })

  if (claim.count === 0) {
    const sub = await db.subscription.findUnique({ where: { id }, select: { status: true, userId: true } })
    if (!sub) return Response.json({ error: "NOT_FOUND" }, { status: 404 })
    return Response.json({ error: "NOT_PENDING", status: sub.status, message: "Only a pending subscription can be rejected." }, { status: 409 })
  }

  const sub = await db.subscription.findUnique({ where: { id }, select: { userId: true } })
  await audit("SUBSCRIPTION_REJECTED", { actor: "admin", entityType: "Subscription", entityId: id, details: `Rejected premium request for ${sub?.userId ?? "unknown"}` })
  return Response.json({ ok: true, id, status: "REJECTED" })
}
