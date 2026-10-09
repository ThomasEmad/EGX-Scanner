import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { audit } from "@/lib/audit"

// POST /api/v1/admin/subscriptions/{id}/cancel — cancel an active subscription
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin(req))) return await unauthorizedResponse()
  const { id } = await params
  const sub = await db.subscription.findUnique({ where: { id } })
  if (!sub) return Response.json({ error: "NOT_FOUND" }, { status: 404 })
  const updated = await db.subscription.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date() } })
  await audit("SUBSCRIPTION_CANCELLED", { actor: "admin", entityType: "Subscription", entityId: id, details: `Subscription cancelled for ${sub.userId}` })
  return Response.json({ ok: true, id: updated.id, status: updated.status })
}
