import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { requireAuth } from "@/lib/access"
import { audit } from "@/lib/audit"
import { checkEndpointRateLimit, getClientIp } from "@/lib/rate-limit"
import { withKeyLock } from "@/lib/key-lock"

// POST /api/v1/subscription/request — user requests premium subscription.
//
// Race safety: the whole flow runs under a per-user key lock, so parallel
// submissions from the same account are serialized (the old code's
// find-then-create could race two requests into a duplicate PaymentRequest
// or even a unique-violation on Subscription.userId). The subscription write
// is an upsert keyed by the unique userId, and the payment-request dedup
// check runs inside the same lock as the subscription write.
export async function POST(req: NextRequest) {
  const userId = await requireAuth(req)
  if (!userId) {
    return Response.json({ error: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 })
  }

  const ip = getClientIp(req)
  const rateLimit = await checkEndpointRateLimit("subscription-request", ip)
  if (!rateLimit.allowed) {
    const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
    return Response.json(
      { error: "RATE_LIMITED", message: "Too many subscription requests. Please try again later.", retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    )
  }

  const body = (await req.json().catch(() => ({}))) as { notes?: string }

  const outcome = await withKeyLock(`sub-req:${userId}`, async () => {
    const plan = await db.plan.findFirst({ where: { name: "PREMIUM", isActive: true } })
    if (!plan) return { error: "NO_PREMIUM_PLAN", status: 400, message: "Premium plan is not available." } as const

    const existing = await db.subscription.findUnique({ where: { userId } })
    if (existing) {
      if (existing.status === "ACTIVE") {
        return { error: "ALREADY_PREMIUM", status: 400, message: "You already have an active premium subscription." } as const
      }
      if (existing.status === "PENDING") {
        return { error: "REQUEST_PENDING", status: 400, message: "Your subscription request is already pending approval.", subscriptionId: existing.id } as const
      }
      await db.subscription.update({
        where: { id: existing.id },
        data: { status: "PENDING", planId: plan.id, notes: body.notes ?? existing.notes },
      })
    } else {
      await db.subscription.create({
        data: {
          userId,
          planId: plan.id,
          status: "PENDING",
        },
      })
    }

    // create/refresh the PaymentRequest so the request surfaces on /admin/payments
    const existingPr = await db.paymentRequest.findFirst({
      where: { userId, planId: plan.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    })
    if (!existingPr) {
      await db.paymentRequest.create({
        data: {
          userId,
          planId: plan.id,
          amount: plan.price,
          currency: plan.currency,
          paymentMethod: "MANUAL_TRANSFER",
          status: "PENDING",
        },
      })
    }
    return { ok: true } as const
  })

  if ("error" in outcome) {
    return Response.json(
      { error: outcome.error, message: outcome.message, ...(outcome.subscriptionId ? { subscriptionId: outcome.subscriptionId } : {}) },
      { status: outcome.status }
    )
  }

  await audit("SUBSCRIPTION_REQUESTED", { actor: userId, entityType: "Subscription", details: `Premium subscription requested by ${userId}` })
  return Response.json({ success: true, status: "PENDING" })
}
