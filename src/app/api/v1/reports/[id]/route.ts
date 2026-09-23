import { db } from "@/lib/db"
import { isAdmin } from "@/lib/admin-auth"

// GET /api/v1/reports/[id] — full processing detail.
//   Admin (x-admin-token): the complete review payload — every report pipeline field
//   (language, statementType, parserVersion, extractionConfidence, errorMessage,
//   uploadedBy/approvedBy, version/supersedesId), values[] with the manual-correction
//   trail, validationResults[] and extractionLogs[] (asc).
//   Public callers (company-detail source-traceability dialog): the same report +
//   values payload WITHOUT the admin-only review collections (validationResults,
//   extractionLogs, internal review fields). Financial values are public read-only
//   data in this app (also served via /companies/[id]/reports), so no new exposure.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = isAdmin(req)

  const report = await db.financialReport.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, ticker: true, nameEn: true, nameAr: true } },
      values: { orderBy: { metricCode: "asc" } },
      ...(admin ? { validationResults: { orderBy: { createdAt: "asc" as const } }, extractionLogs: { orderBy: { createdAt: "asc" as const } } } : {}),
    },
  })
  if (!report) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const company = { id: report.company.id, ticker: report.company.ticker, nameEn: report.company.nameEn, nameAr: report.company.nameAr }

  const base = {
    id: report.id,
    company,
    companyId: report.companyId,
    reportType: report.reportType,
    periodType: report.periodType,
    periodLabel: report.periodLabel,
    fiscalYear: report.fiscalYear,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    publicationDate: report.publicationDate,
    statementType: report.statementType,
    language: report.language,
    sourceName: report.sourceName,
    sourceUrl: report.sourceUrl,
    fileName: report.fileName,
    fileHash: report.fileHash,
    fileSize: report.fileSize,
    processingStatus: report.processingStatus,
    extractionMethod: report.extractionMethod,
    parserVersion: report.parserVersion,
    extractionConfidence: report.extractionConfidence,
    errorMessage: report.errorMessage,
    version: report.version,
    isRestatement: report.isRestatement,
    supersedesId: report.supersedesId,
    isDemoData: report.isDemoData,
    notes: report.notes,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    values: report.values.map((v) => ({
      id: v.id,
      metricCode: v.metricCode,
      originalLabel: v.originalLabel,
      value: v.value,
      unit: v.unit,
      currency: v.currency,
      normalizedValue: v.normalizedValue,
      statementType: v.statementType,
      sourcePage: v.sourcePage,
      sourceText: v.sourceText,
      extractionMethod: v.extractionMethod,
      confidence: v.confidence,
      validationStatus: v.validationStatus,
      validationNotes: v.validationNotes,
      isManuallyCorrected: v.isManuallyCorrected,
      originalValue: v.originalValue,
      correctedBy: v.correctedBy,
      correctedAt: v.correctedAt,
      correctionReason: v.correctionReason,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    })),
  }

  if (!admin) {
    return Response.json({ report: base })
  }

  return Response.json({
    report: {
      ...base,
      // admin-only pipeline/review fields
      uploadedBy: report.uploadedBy,
      reviewedBy: report.reviewedBy,
      reviewedAt: report.reviewedAt,
      approvedBy: report.approvedBy,
      approvedAt: report.approvedAt,
      localFileRef: report.localFileRef,
      validationResults: report.validationResults.map((c) => ({
        id: c.id,
        checkName: c.checkName,
        category: c.category,
        status: c.status,
        severity: c.severity,
        details: c.details,
        createdAt: c.createdAt,
      })),
      extractionLogs: report.extractionLogs.map((l) => ({
        id: l.id,
        stage: l.stage,
        level: l.level,
        message: l.message,
        details: l.details,
        createdAt: l.createdAt,
      })),
    },
  })
}
