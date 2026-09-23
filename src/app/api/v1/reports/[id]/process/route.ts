import { readFile } from "node:fs/promises"
import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { audit } from "@/lib/audit"
import { detectDocumentKind, extractFromCsv, extractFromText, extractPdfText } from "@/lib/financial/extract"
import { validateValues, type ValidatableValue } from "@/lib/financial/validate"
import { recomputeCompany } from "@/lib/financial/recompute"

// POST /api/v1/reports/[id]/process — extraction pipeline (admin):
// detect type → text extraction → table/line extraction → label detection via the
// metric registry (EN + AR aliases) → normalization → validation.
// Insufficient quality ⇒ NEEDS_REVIEW — bad extraction is never silently accepted.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(_req)) return unauthorizedResponse()
  const { id } = await params

  const report = await db.financialReport.findUnique({ where: { id }, include: { company: true } })
  if (!report) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  if (!report.localFileRef) {
    return Response.json({ error: "NO_FILE", message: "This report has no stored document to process" }, { status: 400 })
  }

  await db.financialReport.update({ where: { id }, data: { processingStatus: "PROCESSING" } })

  let buffer: Buffer
  try {
    buffer = await readFile(report.localFileRef)
  } catch {
    await db.financialReport.update({
      where: { id },
      data: { processingStatus: "FAILED", notes: `Stored document could not be read: ${report.localFileRef}` },
    })
    return Response.json({ error: "FILE_READ_FAILED", message: "Stored document could not be read" }, { status: 500 })
  }

  const kind = detectDocumentKind(buffer)
  await audit("PROCESS", { actor: "admin", entityType: "FinancialReport", entityId: id, details: `Detected document kind: ${kind}` })

  let candidates: ValidatableValue[] = []
  let statusNote = ""

  try {
    if (kind === "PDF") {
      const pdf = extractPdfText(buffer)
      if (pdf.looksScanned) {
        statusNote = "Scanned or image-based PDF detected. OCR is a fallback and is not available in this environment — the report requires manual review (NEEDS_REVIEW)."
      } else {
        candidates = extractFromText(pdf.text)
        if (candidates.length === 0) {
          statusNote = "Text-based PDF processed, but no financial labels from the metric registry were detected. The document may use non-standard terminology — manual review required."
        }
      }
    } else if (kind === "TEXT") {
      const text = buffer.toString("utf8")
      const hasCommas = (text.match(/[,;]/g)?.length ?? 0) >= 3
      if (hasCommas) {
        candidates = extractFromCsv(text)
      } else {
        candidates = extractFromText(text)
      }
      if (candidates.length === 0) {
        statusNote = "Text document processed, but no financial labels were recognized. Manual review required."
      }
    } else if (kind === "ZIP_OFFICE") {
      statusNote = "Excel/Word documents are not supported by this extraction pipeline yet. Export the statement to CSV (label, value, unit) or PDF and upload again."
    } else {
      statusNote = "Unknown document type — cannot be processed automatically. Manual review required."
    }
  } catch (e) {
    statusNote = `Extraction failed with an internal error: ${e instanceof Error ? e.message : String(e)}`
  }

  // wipe previously extracted values for this report (idempotent reprocessing)
  await db.financialValue.deleteMany({ where: { reportId: id } })

  if (candidates.length === 0) {
    const status = statusNote ? "NEEDS_REVIEW" : "FAILED"
    await db.financialReport.update({
      where: { id },
      data: { processingStatus: status, extractionMethod: kind === "PDF" ? "PDF_TEXT" : kind === "TEXT" ? "CSV_TEXT" : null, notes: statusNote || "No values extracted" },
    })
    await audit("EXTRACT", { actor: "admin", entityType: "FinancialReport", entityId: id, details: statusNote || "No values extracted" })
    return Response.json({
      ok: false,
      status,
      message: statusNote || "No financial values could be extracted.",
      extractedCount: 0,
    })
  }

  // ---- Normalization + validation ----
  const validated = validateValues(candidates)
  await db.financialValue.createMany({
    data: validated.results.map((r) => ({
      companyId: report.companyId,
      reportId: report.id,
      metricCode: r.metricCode,
      originalLabel: r.input.originalLabel,
      value: r.input.value,
      unit: r.input.unit,
      normalizedValue: r.normalizedValue,
      statementType: r.statementType,
      sourcePage: r.input.sourcePage ?? null,
      sourceText: r.input.sourceText ?? null,
      extractionMethod: kind === "PDF" ? "PDF_TEXT" : "CSV_TEXT",
      confidence: r.input.confidence ?? 1,
      validationStatus: r.validationStatus,
      validationNotes: r.validationNotes.join(" | ") || null,
      isDemoData: false,
    })),
  })

  const newStatus = validated.reportStatus
  const notes = [statusNote, ...validated.reportNotes].filter(Boolean).join(" | ") || null
  await db.financialReport.update({
    where: { id },
    data: {
      processingStatus: newStatus,
      extractionMethod: kind === "PDF" ? "PDF_TEXT" : "CSV_TEXT",
      notes,
    },
  })
  await audit("VALIDATE", {
    actor: "system",
    entityType: "FinancialReport",
    entityId: id,
    details: `${validated.results.length} values extracted → ${newStatus}. ${notes ?? ""}`,
  })

  // if fully validated, recompute the company metrics + events immediately
  let recompute = null
  if (newStatus === "VALIDATED") {
    recompute = await recomputeCompany(report.companyId)
  }

  return Response.json({
    ok: true,
    status: newStatus,
    extractedCount: validated.results.length,
    validCount: validated.results.filter((r) => r.validationStatus === "VALID").length,
    needsReviewCount: validated.results.filter((r) => r.validationStatus === "NEEDS_REVIEW").length,
    failedCount: validated.results.filter((r) => r.validationStatus === "FAILED").length,
    notes,
    recompute,
  })
}
