import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { activateSubscription } from "@/lib/subscription"
import { audit } from "@/lib/audit"

// GET /api/v1/admin/payment-requests
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return unauthorizedResponse()
  const url = new URL(req.url)
  const status = url.searchParams.get("status") || undefined

  const where: Record<string, unknown> = {}
  if (status) where.status = status

  const items = await db.paymentRequest.findMany({
    where,
    include: {
      user: { select: { id: true, email: true, name: true, createdAt: true } },
      plan: { select: { id: true, name: true, price: true, currency: true, durationDays: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return Response.json({ requests: items.map((r) => ({
    id: r.id,
    userId: r.userId,
    userEmail: r.user.email,
    userName: r.user.name,
    planName: r.plan.name,
    planId: r.planId,
    durationDays: r.plan.durationDays,
    amount: r.amount,
    currency: r.currency,
    paymentMethod: r.paymentMethod,
    transactionReference: r.transactionReference,
    status: r.status,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    reviewedBy: r.reviewedBy,
    adminNote: r.adminNote,
    createdAt: r.createdAt.toISOString(),
  })) })
}

// POST /api/v1/admin/payment-requests/{id}/verify
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return unauthorizedResponse()
  const { id } = await params
  const payment = await db.paymentRequest.findUnique({
    where: { id },
    include: { plan: true, user: { select: { id: true, email: true } } },
  })
  if (!payment) return Response.json({ error: "NOT_FOUND" }, { status: 404 })
  if (payment.status !== "PENDING") return Response.json({ error: "ALREADY_PROCESSED" }, { status: 400 })

  const adminId = req.headers.get("x-admin-token") || "admin"

  try {
    const body = await req.json()
    const adminNote = typeof body?.adminNote === "string" ? body.adminNote : null
    const durationDays = typeof body?.durationDays === "number" ? body.durationDays : payment.plan.durationDays

    const updatedPayment = await db.paymentRequest.update({
      where: { id },
      data: {
        status: "VERIFIED",
        reviewedAt: new Date(),
        reviewedBy: adminId,
        adminNote: adminNote ?? undefined,
      },
    })

    const subscription = await activateSubscription({
      userId: payment.userId,
      planId: payment.planId,
      durationDays,
      activatedBy: adminId,
      notes: adminNote ?? `Activated from payment request ${payment.id}`,
    })

    await audit("PAYMENT_VERIFIED", { actor: adminId, entityType: "PaymentRequest", entityId: id, details: `Verified ${payment.plan.name} for ${payment.user.email}` })
    await audit("SUBSCRIPTION_ACTIVATED", { actor: adminId, entityType: "Subscription", entityId: subscription.id, details: `Activated via payment request ${id}` })

    return Response.json({ payment: updatedPayment, subscription })
  } catch (e) {
    console.error("verify payment error", e)
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 })
  }
}

// POST /api/v1/admin/payment-requests/{id}/reject
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return unauthorizedResponse()
  const { id } = await params
  const payment = await db.paymentRequest.findUnique({ where: { id } })
  if (!payment) return Response.json({ error: "NOT_FOUND" }, { status: 404 })
  if (payment.status !== "PENDING") return Response.json({ error: "ALREADY_PROCESSED" }, { status: 400 })

  try {
    const body = await req.json()
    const adminNote = typeof body?.adminNote === "string" ? body.adminNote : "Rejected by admin"

    const updated = await db.paymentRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewedAt: new Date(),
        reviewedBy: req.headers.get("x-admin-token") || "admin",
        adminNote,
      },
    })

    await audit("PAYMENT_REJECTED", { actor: req.headers.get("x-admin-token") || "admin", entityType: "PaymentRequest", entityId: id, details: adminNote })
    return Response.json(updated)
  } catch (e) {
    console.error("reject payment error", e)
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 })
  }
}
