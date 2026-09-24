import { db } from "@/lib/db"

// GET /api/v1/review — human review queue: values that failed validation
// (NEEDS_REVIEW) with full context for the reviewer.

export async function GET() {
  const [values, reports] = await Promise.all([
    db.financialValue.findMany({
      where: { validationStatus: "NEEDS_REVIEW", report: { processingStatus: { not: "DELETED" } } },
      include: {
        company: { select: { ticker: true, nameEn: true, nameAr: true } },
        report: { select: { id: true, periodLabel: true, periodType: true, processingStatus: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.financialReport.findMany({
      where: { processingStatus: { in: ["NEW_DOWNLOADED", "NEEDS_REVIEW", "PROCESSING", "FAILED", "REJECTED"] } },
      include: {
        company: { select: { ticker: true, nameEn: true, nameAr: true } },
        _count: { select: { values: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ])

  return Response.json({
    values: values.map((v) => ({
      id: v.id,
      metricCode: v.metricCode,
      originalLabel: v.originalLabel,
      value: v.value,
      unit: v.unit,
      normalizedValue: v.normalizedValue,
      currency: v.currency,
      sourcePage: v.sourcePage,
      sourceText: v.sourceText,
      extractionMethod: v.extractionMethod,
      confidence: v.confidence,
      validationNotes: v.validationNotes,
      company: v.company,
      report: v.report,
      createdAt: v.createdAt,
    })),
    reports: reports.map((r) => ({
      id: r.id,
      periodLabel: r.periodLabel,
      periodType: r.periodType,
      processingStatus: r.processingStatus,
      notes: r.notes,
      company: r.company,
      valueCount: r._count.values,
      fileHash: r.fileHash,
      createdAt: r.createdAt,
    })),
  })
}
