import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { audit } from "@/lib/audit"

// POST /api/v1/reports/[id]/reject — admin rejects a report that failed review.
// Body: { reason } (required). Only from VALIDATED / NEEDS_REVIEW / FAILED —
// never from PROCESSING/NEW_DOWNLOADED (process it first) and never from APPROVED
// (an approved report must be superseded by a restatement, not rejected).
// The report is marked REJECTED, the reason stored in errorMessage, and the
// rejection is audit-logged. Rejected reports are excluded from recomputation.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return unauthorizedResponse()
  const { id } = await params

  const body = await req.json().catch(() => null)
  const reason = typeof body?.reason === "string" ? body.reason.trim() : ""
  if (!reason) {
    return Response.json({ error: "VALIDATION", message: "reason is required to reject a report" }, { status: 400 })
  }

  const report = await db.financialReport.findUnique({ where: { id }, include: { company: { select: { ticker: true } } } })
  if (!report) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  if (!["VALIDATED", "NEEDS_REVIEW", "FAILED"].includes(report.processingStatus)) {
    return Response.json(
      { error: "INVALID_STATUS", message: `Reports can only be rejected from VALIDATED, NEEDS_REVIEW or FAILED (current status: ${report.processingStatus}).` },
      { status: 409 }
    )
  }

  const now = new Date()
  await db.financialReport.update({
    where: { id },
    data: {
      processingStatus: "REJECTED",
      errorMessage: reason,
      reviewedBy: "admin",
      reviewedAt: now,
    },
  })
  await audit("REVIEW_REJECT", {
    actor: "admin",
    entityType: "FinancialReport",
    entityId: id,
    details: `${report.company.ticker} ${report.periodLabel} (${report.statementType}) rejected: ${reason}`,
  })

  return Response.json({ ok: true, status: "REJECTED" })
}
