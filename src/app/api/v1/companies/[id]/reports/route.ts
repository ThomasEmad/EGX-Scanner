import { db } from "@/lib/db"

// GET /api/v1/companies/[id]/reports — report list for the company.
// Investor-facing period metadata only: pipeline internals (source URLs,
// local file refs, hashes, extraction method, processing/approval workflow)
// are internal data-engineering documentation and never exposed publicly.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const company = await db.company.findUnique({ where: { id }, select: { id: true } })
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const reports = await db.financialReport.findMany({
    where: { companyId: id, deletedAt: null },
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
      statementType: r.statementType,
      valueCount: r._count.values,
    })),
  })
}
