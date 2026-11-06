import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { audit } from "@/lib/audit"

// POST /api/v1/admin/payment-requests/{id}/verify — mark the payment verified
// and activate the user's pending premium subscription.
//
// Race safety: the PENDING check and the status flip are ONE conditional
// updateMany ({ id, status: "PENDING" }), so of two concurrent verify/reject
// calls exactly one wins the claim — the loser gets 409 and never touches the
// subscription. The whole mutation runs in a single transaction so the
// payment row and the subscription upsert commit atomically (the old
// find-then-create sequence could race into two subscription rows).
const DURATION_DAYS = 30

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin(req))) return await unauthorizedResponse()
  const { id } = await params

  const now = new Date()
  const endsAt = new Date(now.getTime() + DURATION_DAYS * 24 * 60 * 60 * 1000)

  try {
    const result = await db.$transaction(async (tx) => {
      // Atomic claim: only the first concurrent reviewer flips PENDING.
      const claim = await tx.paymentRequest.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "VERIFIED", reviewedAt: now },
      })
      if (claim.count === 0) {
        const pr = await tx.paymentRequest.findUnique({ where: { id }, select: { status: true } })
        if (!pr) return { conflict: "NOT_FOUND" as const }
        return { conflict: "ALREADY_REVIEWED" as const, status: pr.status }
      }

      const pr = await tx.paymentRequest.findUnique({ where: { id }, select: { userId: true, planId: true } })
      if (!pr) return { conflict: "NOT_FOUND" as const }

      // Upsert keyed by the unique userId column — cannot duplicate.
      await tx.subscription.upsert({
        where: { userId: pr.userId },
        create: {
          userId: pr.userId,
          planId: pr.planId,
          status: "ACTIVE",
          startDate: now,
          endDate: endsAt,
          activatedAt: now,
        },
        update: {
          status: "ACTIVE",
          planId: pr.planId,
          startDate: now,
          endDate: endsAt,
          activatedAt: now,
        },
      })
      return { userId: pr.userId }
    })

    if ("conflict" in result) {
      if (result.conflict === "NOT_FOUND") {
        return Response.json({ error: "NOT_FOUND" }, { status: 404 })
      }
      return Response.json({ error: "ALREADY_REVIEWED", status: result.status }, { status: 409 })
    }

    await audit("PAYMENT_VERIFIED", { actor: "admin", entityType: "PaymentRequest", entityId: id, details: `Payment verified — premium activated for user ${result.userId} (${DURATION_DAYS}d)` })
    return Response.json({ ok: true, id, status: "VERIFIED" })
  } catch (e) {
    console.error("payment verify error", e)
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 })
  }
}
