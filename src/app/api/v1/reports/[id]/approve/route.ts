import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { audit } from "@/lib/audit"
import { recomputeCompany } from "@/lib/financial/recompute"

// POST /api/v1/reports/[id]/approve — admin approves a processed report.
// Approval triggers recomputation of derived metrics + event detection.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(_req)) return unauthorizedResponse()
  const { id } = await params

  const report = await db.financialReport.findUnique({ where: { id }, include: { values: true, company: { select: { ticker: true } } } })
  if (!report) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const pending = report.values.filter((v) => v.validationStatus === "PENDING" || v.validationStatus === "NEEDS_REVIEW")
  if (pending.length > 0) {
    return Response.json(
      { error: "REVIEW_REQUIRED", message: `${pending.length} value(s) still need review before this report can be approved.` },
      { status: 409 }
    )
  }

  await db.financialReport.update({ where: { id }, data: { processingStatus: "APPROVED" } })
  await audit("APPROVE_REPORT", { actor: "admin", entityType: "FinancialReport", entityId: id, details: `${report.company.ticker} ${report.periodLabel} approved` })

  const recompute = await recomputeCompany(report.companyId)
  return Response.json({ ok: true, status: "APPROVED", recompute })
}
