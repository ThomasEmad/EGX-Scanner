import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { requireAdminOrUser, unauthorizedResponse } from "@/lib/access"
import { audit } from "@/lib/audit"

// POST /api/v1/reports/{id}/reprocess — retry processing for FAILED/REJECTED/NEEDS_REVIEW documents.
// Resets status to NEW_DOWNLOADED and clears processing state so the pipeline can be re-run.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdminOrUser(req)
  if (!actor) return unauthorizedResponse()

  const { id } = await params
  const report = await db.financialReport.findUnique({ where: { id } })
  if (!report) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const retryable = ["FAILED", "REJECTED", "NEEDS_REVIEW", "NEW_DOWNLOADED", "EXTRACTED", "VALIDATED"]
  if (!retryable.includes(report.processingStatus)) {
    return Response.json(
      { error: "CANNOT_REPROCESS", message: `Document is ${report.processingStatus} and cannot be reprocessed.` },
      { status: 409 }
    )
  }

  const updated = await db.financialReport.update({
    where: { id },
    data: {
      processingStatus: "NEW_DOWNLOADED",
      errorMessage: null,
      extractionMethod: null,
      parserVersion: null,
      extractionConfidence: null,
      notes: [report.notes, "Reprocessed by " + actor].filter(Boolean).join(" | "),
    },
  })

  await db.financialExtractionLog.create({
    data: {
      reportId: id,
      stage: "UPLOAD",
      level: "INFO",
      message: `Document reset to NEW_DOWNLOADED for reprocessing by ${actor}`,
    },
  })

  await audit("REPORT_REPROCESSED", {
    actor,
    entityType: "FinancialReport",
    entityId: id,
    details: `Reset report ${report.periodLabel} (was ${report.processingStatus}) for reprocessing`,
  })

  return Response.json({ ok: true, id: updated.id, processingStatus: updated.processingStatus })
}
