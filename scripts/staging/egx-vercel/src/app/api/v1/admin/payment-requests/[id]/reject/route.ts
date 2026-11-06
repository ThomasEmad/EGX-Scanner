import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { audit } from "@/lib/audit"

// POST /api/v1/admin/payment-requests/{id}/reject — reject with a mandatory note.
//
// Race safety: identical claim pattern to the verify route — the conditional
// updateMany ({ id, status: "PENDING" }) lets exactly one of any number of
// concurrent verify/reject calls proceed; the rest get 409.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin(req))) return await unauthorizedResponse()
  const { id } = await params

  const body = (await req.json().catch(() => ({}))) as { adminNote?: string }
  const note = (body.adminNote || "").trim()
  if (!note) return Response.json({ error: "ADMIN_NOTE_REQUIRED", message: "A rejection note is required." }, { status: 400 })

  // Atomic claim + rejection in one conditional write; the pending
  // subscription side-effect stays guarded by its own status filter.
  const claim = await db.paymentRequest.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "REJECTED", reviewedAt: new Date(), adminNote: note },
  })

  if (claim.count === 0) {
    const pr = await db.paymentRequest.findUnique({ where: { id }, select: { status: true } })
    if (!pr) return Response.json({ error: "NOT_FOUND" }, { status: 404 })
    return Response.json({ error: "ALREADY_REVIEWED", status: pr.status }, { status: 409 })
  }

  const pr = await db.paymentRequest.findUnique({ where: { id }, select: { userId: true } })
  await db.subscription.updateMany({
    where: { userId: pr?.userId ?? "", status: "PENDING" },
    data: { status: "REJECTED" },
  })

  await audit("PAYMENT_REJECTED", { actor: "admin", entityType: "PaymentRequest", entityId: id, details: `Payment rejected — ${note}` })
  return Response.json({ ok: true, id, status: "REJECTED" })
}
