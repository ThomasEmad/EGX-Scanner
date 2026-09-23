import { db } from "@/lib/db"

// GET /api/v1/companies/[id]/reports — report list for the company (with version
// and processing status).

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const company = await db.company.findUnique({ where: { id }, select: { id: true } })
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const reports = await db.financialReport.findMany({
    where: { companyId: id },
    orderBy: [{ periodType: "asc" }, { fiscalYear: "desc" }],
    include: { _count: { select: { values: true } } },
  })

  return Response.json({
    reports: reports.map((r) => ({
      id: r.id,
      reportType: r.reportType,
      periodType: r.periodType,
      fiscalYear: r.fiscalYear,
      periodLabel: r.periodLabel,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      publicationDate: r.publicationDate,
      sourceName: r.sourceName,
      sourceUrl: r.sourceUrl,
      localFileRef: r.localFileRef,
      fileHash: r.fileHash,
      processingStatus: r.processingStatus,
      extractionMethod: r.extractionMethod,
      version: r.version,
      isRestatement: r.isRestatement,
      isDemoData: r.isDemoData,
      notes: r.notes,
      valueCount: r._count.values,
    })),
  })
}
