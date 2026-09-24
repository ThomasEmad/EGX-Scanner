import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { activateSubscription, cancelSubscription, type SubscriptionInfo } from "@/lib/subscription"
import { audit } from "@/lib/audit"

// GET /api/v1/admin/subscriptions
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return unauthorizedResponse()
  const url = new URL(req.url)
  const status = url.searchParams.get("status") || undefined
  const where: Record<string, unknown> = {}
  if (status) where.status = status

  const subs = await db.subscription.findMany({
    where,
    include: {
      user: { select: { id: true, email: true, name: true, role: true, createdAt: true } },
      plan: { select: { id: true, name: true, price: true, currency: true, durationDays: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return Response.json({ subscriptions: subs.map((s) => ({
    id: s.id,
    status: s.status,
    startDate: s.startDate?.toISOString() ?? null,
    endDate: s.endDate?.toISOString() ?? null,
    activatedAt: s.activatedAt?.toISOString() ?? null,
    activatedBy: s.activatedBy,
    cancelledAt: s.cancelledAt?.toISOString() ?? null,
    notes: s.notes,
    createdAt: s.createdAt.toISOString(),
    user: s.user,
    plan: s.plan,
  })) })
}

// POST /api/v1/admin/subscriptions/{id}/activate
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return unauthorizedResponse()
  const { id } = await params
  const sub = await db.subscription.findUnique({ where: { id }, include: { plan: true } })
  if (!sub) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const adminToken = req.headers.get("x-admin-token")
  const adminId = adminToken || "admin"

  try {
    const body = await req.json()
    const durationDays = typeof body?.durationDays === "number" ? body.durationDays : (sub.plan.durationDays || 30)
    const notes = typeof body?.notes === "string" ? body.notes : sub.notes

    const updated = await activateSubscription({
      userId: sub.userId,
      planId: sub.planId,
      durationDays,
      activatedBy: adminId,
      notes,
    })

    await audit("SUBSCRIPTION_ACTIVATED", { actor: adminId, entityType: "Subscription", entityId: sub.id, details: `Activated ${sub.plan.name} for ${sub.userId}` })
    return Response.json(updated)
  } catch (e) {
    console.error("activate subscription error", e)
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 })
  }
}

// POST /api/v1/admin/subscriptions/{id}/extend
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return unauthorizedResponse()
  const { id } = await params
  const sub = await db.subscription.findUnique({ where: { id } })
  if (!sub) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  try {
    const body = await req.json()
    const extraDays = typeof body?.extraDays === "number" ? body.extraDays : 30
    const now = new Date()
    let endDate = new Date(sub.endDate || now)
    if (sub.status !== "ACTIVE" || !sub.endDate || new Date(sub.endDate) < now) {
      endDate = now
    }
    endDate.setDate(endDate.getDate() + extraDays)

    const updated = await db.subscription.update({
      where: { id },
      data: {
        status: "ACTIVE",
        endDate,
        activatedAt: sub.activatedAt ?? now,
        cancelledAt: null,
      },
      include: { plan: { select: { name: true } } },
    })

    await audit("SUBSCRIPTION_EXTENDED", { actor: req.headers.get("x-admin-token") || "admin", entityType: "Subscription", entityId: id, details: `Extended by ${extraDays} days` })
    return Response.json({ id: updated.id, endDate: updated.endDate?.toISOString() ?? null, status: updated.status })
  } catch (e) {
    console.error("extend subscription error", e)
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 })
  }
}

// POST /api/v1/admin/subscriptions/{id}/cancel
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return unauthorizedResponse()
  const { id } = await params
  const result = await cancelSubscription(id, "Cancelled by admin")
  if (!result) return Response.json({ error: "NOT_FOUND" }, { status: 404 })
  await audit("SUBSCRIPTION_CANCELLED", { actor: req.headers.get("x-admin-token") || "admin", entityType: "Subscription", entityId: id, details: "Cancelled by admin" })
  return Response.json(result)
}
