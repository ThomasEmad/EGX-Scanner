import { db } from "@/lib/db"
import { requireAdminOrUser, unauthorizedResponse } from "@/lib/access"
import { audit } from "@/lib/audit"
import { recomputeCompany } from "@/lib/financial/recompute"

// POST /api/v1/reports/[id]/approve — admin approves a processed report.
// Only from VALIDATED (re-approving an already APPROVED report is idempotent).
// Approval stamps approvedBy/approvedAt + reviewedBy/reviewedAt and triggers
// recomputation of derived metrics + event detection (statement-type aware).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdminOrUser(req)
  if (!actor) return unauthorizedResponse()
  const { id } = await params

  const report = await db.financialReport.findUnique({ where: { id }, include: { values: true, company: { select: { ticker: true } } } })
  if (!report) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  if (!["VALIDATED", "APPROVED"].includes(report.processingStatus)) {
    return Response.json(
      { error: "INVALID_STATUS", message: `Report must be VALIDATED before approval (current status: ${report.processingStatus}). Process it first and resolve any review items.` },
      { status: 409 }
    )
  }

  const pending = report.values.filter((v) => v.validationStatus === "PENDING" || v.validationStatus === "NEEDS_REVIEW")
  if (pending.length > 0) {
    return Response.json(
      { error: "REVIEW_REQUIRED", message: `${pending.length} value(s) still need review before this report can be approved.` },
      { status: 409 }
    )
  }

  const now = new Date()
  await db.financialReport.update({
    where: { id },
    data: {
      processingStatus: "APPROVED",
      approvedBy: "admin",
      approvedAt: now,
      reviewedBy: "admin",
      reviewedAt: now,
      errorMessage: null,
    },
  })
  await audit("APPROVE_REPORT", {
    actor: "admin",
    entityType: "FinancialReport",
    entityId: id,
    details: `${report.company.ticker} ${report.periodLabel} (${report.statementType}) approved — values: ${report.values.length}`,
  })

  const recompute = await recomputeCompany(report.companyId)
  return Response.json({ ok: true, status: "APPROVED", recompute })
}
