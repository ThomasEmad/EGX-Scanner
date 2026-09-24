import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { requireAdminOrUser, unauthorizedResponse } from "@/lib/access"
import { audit } from "@/lib/audit"

// POST /api/v1/reports/{id}/delete — soft-delete a document.
// Only allowed when status is FAILED, REJECTED, NEEDS_REVIEW, NEW_DOWNLOADED, or VALIDATED.
// Active processing cannot be deleted.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdminOrUser(req)
  if (!actor) return unauthorizedResponse()

  const { id } = await params
  const report = await db.financialReport.findUnique({ where: { id } })
  if (!report) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const nonDeletable = ["PROCESSING", "DELETED"]
  if (nonDeletable.includes(report.processingStatus)) {
    return Response.json(
      { error: "CANNOT_DELETE", message: `Document is ${report.processingStatus} and cannot be deleted.` },
      { status: 409 }
    )
  }

  const updated = await db.financialReport.update({
    where: { id },
    data: {
      processingStatus: "DELETED",
      deletedAt: new Date(),
      deletedBy: actor,
      notes: [report.notes, "Deleted by " + actor].filter(Boolean).join(" | "),
    },
  })

  await audit("REPORT_DELETED", {
    actor,
    entityType: "FinancialReport",
    entityId: id,
    details: `Deleted report ${report.periodLabel} (${report.processingStatus})`,
  })

  return Response.json({ ok: true, id: updated.id, processingStatus: updated.processingStatus })
}
