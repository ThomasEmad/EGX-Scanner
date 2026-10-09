import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { audit } from "@/lib/audit"

// POST /api/v1/admin/payment-requests/{id}/verify — mark the payment verified
// and activate the user's pending premium subscription.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin(req))) return await unauthorizedResponse()
  const { id } = await params
  const pr = await db.paymentRequest.findUnique({ where: { id } })
  if (!pr) return Response.json({ error: "NOT_FOUND" }, { status: 404 })
  if (pr.status !== "PENDING") return Response.json({ error: "ALREADY_REVIEWED", status: pr.status }, { status: 409 })

  const now = new Date()
  const updated = await db.paymentRequest.update({
    where: { id },
    data: { status: "VERIFIED", reviewedAt: now },
  })

  const sub = await db.subscription.findUnique({ where: { userId: pr.userId } })
  const durationDays = 30
  if (sub) {
    await db.subscription.update({
      where: { id: sub.id },
      data: {
        status: "ACTIVE",
        planId: pr.planId,
        startDate: now,
        endDate: new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000),
        activatedAt: now,
      },
    })
  } else {
    await db.subscription.create({
      data: { userId: pr.userId, planId: pr.planId, status: "ACTIVE", startDate: now, endDate: new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000), activatedAt: now },
    })
  }

  await audit("PAYMENT_VERIFIED", { actor: "admin", entityType: "PaymentRequest", entityId: id, details: `Payment verified — premium activated for user ${pr.userId} (${durationDays}d)` })
  return Response.json({ ok: true, id: updated.id, status: updated.status })
}
