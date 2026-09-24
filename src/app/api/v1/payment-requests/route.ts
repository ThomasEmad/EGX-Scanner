import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/auth"
import { audit } from "@/lib/audit"

// GET /api/v1/payment-requests/me
export async function GET(req: NextRequest) {
  const token = req.headers.get("x-session-token") || req.headers.get("authorization")?.replace("Bearer ", "")
  const userId = getSessionUser(token)
  if (!userId) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 })
  const items = await db.paymentRequest.findMany({
    where: { userId },
    include: { plan: { select: { name: true, price: true, currency: true } } },
    orderBy: { createdAt: "desc" },
  })
  return Response.json({ requests: items.map((r) => ({
    id: r.id,
    planName: r.plan.name,
    amount: r.amount,
    currency: r.currency,
    paymentMethod: r.paymentMethod,
    transactionReference: r.transactionReference,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    adminNote: r.adminNote,
  })) })
}

// POST /api/v1/payment-requests
export async function POST(req: NextRequest) {
  const token = req.headers.get("x-session-token") || req.headers.get("authorization")?.replace("Bearer ", "")
  const userId = getSessionUser(token)
  if (!userId) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 })

  try {
    const body = await req.json()
    const planId = typeof body?.planId === "string" ? body.planId.trim() : ""
    const amount = typeof body?.amount === "number" ? body.amount : Number(body?.amount ?? 0)
    const paymentMethod = typeof body?.paymentMethod === "string" ? body.paymentMethod.trim() : "MANUAL_TRANSFER"
    const transactionReference = typeof body?.transactionReference === "string" ? body.transactionReference.trim() : null
    if (!planId || !amount || amount <= 0) return Response.json({ error: "INVALID_PAYLOAD" }, { status: 400 })

    const plan = await db.plan.findUnique({ where: { id: planId }, select: { id: true, name: true, price: true, currency: true, isActive: true } })
    if (!plan || !plan.isActive) return Response.json({ error: "PLAN_NOT_FOUND" }, { status: 404 })

    const request = await db.paymentRequest.create({
      data: {
        userId,
        planId: plan.id,
        amount,
        currency: plan.currency,
        paymentMethod,
        transactionReference: transactionReference ?? undefined,
      },
      include: { plan: { select: { name: true, price: true, currency: true } } },
    })

    await audit("PAYMENT_REQUEST_CREATED", { actor: userId, entityType: "PaymentRequest", entityId: request.id, details: `${plan.name} ${plan.currency} ${amount}` })

    return Response.json({ id: request.id, status: request.status, createdAt: request.createdAt.toISOString() }, { status: 201 })
  } catch (e) {
    console.error("payment request error", e)
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 })
  }
}
