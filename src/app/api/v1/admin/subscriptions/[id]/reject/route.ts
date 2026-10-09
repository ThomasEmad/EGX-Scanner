import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { audit } from "@/lib/audit"

// POST /api/v1/admin/subscriptions/{id}/reject — admin rejects a pending subscription request
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin(req))) return await unauthorizedResponse()
  const { id } = await params
  const sub = await db.subscription.findUnique({ where: { id } })
  if (!sub) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as { adminNote?: string }
  const updated = await db.subscription.update({
    where: { id },
    data: {
      status: "REJECTED",
      notes: body.adminNote ?? sub.notes,
    },
  })

  await audit("SUBSCRIPTION_REJECTED", { actor: req.headers.get("x-admin-token") || "admin", entityType: "Subscription", entityId: id, details: `Rejected premium request for ${sub.userId}` })
  return Response.json({ id: updated.id, status: updated.status })
}
