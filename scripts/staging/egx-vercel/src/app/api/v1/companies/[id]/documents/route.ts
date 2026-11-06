import { db } from "@/lib/db"
import { findCompanyByKey } from "@/lib/company-lookup"

// GET /api/v1/companies/[id]/documents — document list backing the
// company-page Documents tab. Investor-facing fields only: the pipeline
// internals (processing status, extraction confidence, parser version,
// approval workflow, file hashes, source URLs) are never exposed — they are
// internal data-engineering documentation.
//
// `[id]` accepts company id, ticker or ISIN (see findCompanyByKey).
//
// Privacy: localFileRef (the internal storage path) is NEVER exposed — use
// /api/v1/reports/[id]/download for file access.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const company = await findCompanyByKey(id)
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const reports = await db.financialReport.findMany({
    where: { companyId: company.id, deletedAt: null },
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
      fileName: r.fileName,
      fileSize: r.fileSize,
      hasFile: !!r.localFileRef,
      valueCount: r._count.values,
    })),
  })
}
