import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/auth"
import { audit } from "@/lib/audit"
import { checkEndpointRateLimit, getClientIp } from "@/lib/rate-limit"
import { withKeyLock } from "@/lib/key-lock"

// GET /api/v1/payment-requests/me
export async function GET(req: NextRequest) {
  const token = (req.headers.get("x-session-token") ?? req.headers.get("authorization")?.replace("Bearer ", "") ?? null)
  const userId = await getSessionUser(token)
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

// POST /api/v1/payment-requests — file a manual payment request.
// Rate limited per IP; per-user key lock serializes submissions so a
// double-click cannot create two requests for the same plan while one is
// still PENDING (the existing pending request is returned instead).
export async function POST(req: NextRequest) {
  const token = (req.headers.get("x-session-token") ?? req.headers.get("authorization")?.replace("Bearer ", "") ?? null)
  const userId = await getSessionUser(token)
  if (!userId) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 })

  const ip = getClientIp(req)
  const rateLimit = await checkEndpointRateLimit("payment-request", ip)
  if (!rateLimit.allowed) {
    const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
    return Response.json(
      { error: "RATE_LIMITED", message: "Too many payment requests. Please try again later.", retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    )
  }

  try {
    const body = await req.json()
    const planId = typeof body?.planId === "string" ? body.planId.trim() : ""
    const paymentMethod = typeof body?.paymentMethod === "string" ? body.paymentMethod.trim().slice(0, 40) : "MANUAL_TRANSFER"
    const transactionReference = typeof body?.transactionReference === "string" ? body.transactionReference.trim().slice(0, 80) : null
    if (!planId) return Response.json({ error: "INVALID_PAYLOAD" }, { status: 400 })

    const plan = await db.plan.findUnique({ where: { id: planId }, select: { id: true, name: true, price: true, currency: true, isActive: true } })
    if (!plan || !plan.isActive) return Response.json({ error: "PLAN_NOT_FOUND" }, { status: 404 })

    // Security: the amount is ALWAYS the plan's server-side price. The client
    // used to control `amount`, letting a user file a premium request for an
    // arbitrary (tiny) figure and mislead the manual payment review.
    const result = await withKeyLock(`pay-req:${userId}`, async () => {
      // Idempotency guard: reuse an existing PENDING request for the same
      // user+plan instead of stacking duplicates.
      const pending = await db.paymentRequest.findFirst({
        where: { userId, planId: plan.id, status: "PENDING" },
        orderBy: { createdAt: "desc" },
        include: { plan: { select: { name: true, price: true, currency: true } } },
      })
      if (pending) return { request: pending, created: false }

      const request = await db.paymentRequest.create({
        data: {
          userId,
          planId: plan.id,
          amount: plan.price,
          currency: plan.currency,
          paymentMethod,
          transactionReference: transactionReference ?? undefined,
        },
        include: { plan: { select: { name: true, price: true, currency: true } } },
      })
      return { request, created: true }
    })

    if (result.created) {
      await audit("PAYMENT_REQUEST_CREATED", { actor: userId, entityType: "PaymentRequest", entityId: result.request.id, details: `${plan.name} ${plan.currency} ${plan.price}` })
      return Response.json({ id: result.request.id, status: result.request.status, createdAt: result.request.createdAt.toISOString() }, { status: 201 })
    }

    // Duplicate submission — point the client at the request already in review.
    return Response.json(
      {
        id: result.request.id,
        status: result.request.status,
        createdAt: result.request.createdAt.toISOString(),
        duplicate: true,
        message: "A payment request for this plan is already pending review.",
      },
      { status: 200 }
    )
  } catch (e) {
    console.error("payment request error", e)
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 })
  }
}
