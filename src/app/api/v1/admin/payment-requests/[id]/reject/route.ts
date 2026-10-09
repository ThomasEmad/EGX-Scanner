import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { audit } from "@/lib/audit"

// POST /api/v1/admin/payment-requests/{id}/reject — reject with a mandatory note
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin(req))) return await unauthorizedResponse()
  const { id } = await params
  const pr = await db.paymentRequest.findUnique({ where: { id } })
  if (!pr) return Response.json({ error: "NOT_FOUND" }, { status: 404 })
  if (pr.status !== "PENDING") return Response.json({ error: "ALREADY_REVIEWED", status: pr.status }, { status: 409 })

  const body = (await req.json().catch(() => ({}))) as { adminNote?: string }
  const note = (body.adminNote || "").trim()
  if (!note) return Response.json({ error: "ADMIN_NOTE_REQUIRED", message: "A rejection note is required." }, { status: 400 })

  const updated = await db.paymentRequest.update({ where: { id }, data: { status: "REJECTED", reviewedAt: new Date(), adminNote: note } })
  await db.subscription.updateMany({ where: { userId: pr.userId, status: "PENDING" }, data: { status: "REJECTED" } })

  await audit("PAYMENT_REJECTED", { actor: "admin", entityType: "PaymentRequest", entityId: id, details: `Payment rejected — ${note}` })
  return Response.json({ ok: true, id: updated.id, status: updated.status })
}
