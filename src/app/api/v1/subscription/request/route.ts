import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { requireAuth } from "@/lib/access"
import { audit } from "@/lib/audit"

// POST /api/v1/subscription/request — user requests premium subscription
export async function POST(req: NextRequest) {
  const userId = await requireAuth(req)
  if (!userId) {
    return Response.json({ error: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as { notes?: string }
  const plan = await db.plan.findFirst({ where: { name: "PREMIUM", isActive: true } })
  if (!plan) {
    return Response.json({ error: "NO_PREMIUM_PLAN", message: "Premium plan is not available." }, { status: 400 })
  }

  const existing = await db.subscription.findUnique({ where: { userId } })
  if (existing) {
    if (existing.status === "ACTIVE") {
      return Response.json({ error: "ALREADY_PREMIUM", message: "You already have an active premium subscription." }, { status: 400 })
    }
    if (existing.status === "PENDING") {
      return Response.json({ error: "REQUEST_PENDING", message: "Your subscription request is already pending approval.", subscriptionId: existing.id }, { status: 400 })
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

  await audit("SUBSCRIPTION_REQUESTED", { actor: userId, entityType: "Subscription", details: `Premium subscription requested by ${userId}` })
  return Response.json({ success: true, status: "PENDING" })
}
