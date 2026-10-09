import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { audit } from "@/lib/audit"

// POST /api/v1/admin/subscriptions/{id}/activate — activate a pending subscription (30 days)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin(req))) return await unauthorizedResponse()
  const { id } = await params
  const sub = await db.subscription.findUnique({ where: { id } })
  if (!sub) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const now = new Date()
  const updated = await db.subscription.update({
    where: { id },
    data: { status: "ACTIVE", startDate: now, endDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), activatedAt: now },
  })
  await audit("SUBSCRIPTION_ACTIVATED", { actor: "admin", entityType: "Subscription", entityId: id, details: `Premium activated for ${sub.userId} (30d)` })
  return Response.json({ ok: true, id: updated.id, status: updated.status })
}
