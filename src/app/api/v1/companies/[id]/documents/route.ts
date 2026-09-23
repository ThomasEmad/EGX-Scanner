import { db } from "@/lib/db"

// GET /api/v1/companies/[id]/documents — public document registry backing the
// company-page Documents tab. Lists every uploaded filing with its pipeline
// state and data-quality metadata.
//
// Privacy: localFileRef (the internal storage path) is NEVER exposed — use
// /api/v1/reports/[id]/download for file access.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const company = await db.company.findUnique({ where: { id }, select: { id: true } })
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const reports = await db.financialReport.findMany({
    where: { companyId: id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { values: true } } },
  })

  return Response.json({
    documents: reports.map((r) => ({
      id: r.id,
      periodLabel: r.periodLabel,
      periodType: r.periodType,
      fiscalYear: r.fiscalYear,
      statementType: r.statementType,
      language: r.language,
      processingStatus: r.processingStatus,
      extractionConfidence: r.extractionConfidence,
      parserVersion: r.parserVersion,
      version: r.version,
      isRestatement: r.isRestatement,
      fileName: r.fileName,
      fileSize: r.fileSize,
      fileHash: r.fileHash,
      sourceUrl: r.sourceUrl,
      approvedAt: r.approvedAt,
      createdAt: r.createdAt,
      hasFile: !!r.localFileRef,
      valueCount: r._count.values,
    })),
  })
}
